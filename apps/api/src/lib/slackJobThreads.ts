import { prisma } from "@plumbtrack/database";
import { publishToOrg } from "./liveBus";
import { slackPostMessage, slackUserName, type SlackApiResult } from "./slackApi";

/**
 * Slack ↔ JobMessage bridge (design §4.6, HANDOVER backlog P1).
 *
 * Every job gets ONE Slack thread in the channel the office routes for
 * `job.message_posted`. Outbound: the first bridged message posts the thread
 * parent (job, customer, address) and records a SlackJobThread; that message
 * and every later one are threaded replies. Inbound: a human reply typed in
 * that thread arrives through the signed Events endpoint and becomes a
 * `dispatch`-direction JobMessage on the job, fanned out live to the field
 * agent and HQ.
 *
 * Loop safety: inbound rows are written with source "slack" and never emit
 * `job.message_posted`, and bot/own-app messages are ignored inbound, so a
 * message can't bounce between the two sides.
 *
 * The bridge is ON for an org only when a workspace is connected AND a
 * channel is routed for `job.message_posted` — clients show that state as-is.
 */

export const JOB_MESSAGE_EVENT = "job.message_posted";

export interface JobThreadPayload {
  jobId: string;
  headerText: string;
  headerBlocks?: unknown[];
}

export interface JobThreadDeliveryResult {
  delivered: boolean;
  retryable: boolean;
  error?: string;
  providerMessageId?: string;
}

export interface BridgeStatus {
  /** A Slack workspace is connected for the org. */
  connected: boolean;
  /** Job messages are routed to a channel — they will reach Slack. */
  linked: boolean;
}

/** Slack errors that will fail the same way on every retry. */
const TERMINAL_SLACK_ERRORS = new Set([
  "channel_not_found",
  "not_in_channel",
  "is_archived",
  "invalid_auth",
  "account_inactive",
  "token_revoked",
  "missing_scope",
  "msg_too_long",
  "no_text",
  "restricted_action",
]);

function classify(result: SlackApiResult<unknown>, fallback: string): JobThreadDeliveryResult {
  const error = result.error ?? fallback;
  if (result.httpStatus !== undefined) {
    return { delivered: false, retryable: result.httpStatus === 429 || result.httpStatus >= 500, error };
  }
  return { delivered: false, retryable: !TERMINAL_SLACK_ERRORS.has(error), error };
}

/** Bridge state for an org. Decoration for clients — a store that can't
 *  answer (table not migrated yet) reports the bridge as off rather than
 *  failing the read it rides on. */
export async function jobThreadBridgeStatus(orgId: string): Promise<BridgeStatus> {
  try {
    const workspace = await prisma.slackWorkspace.findFirst({
      where: { orgId },
      select: { id: true, channelRoutes: { where: { eventType: JOB_MESSAGE_EVENT }, select: { channelId: true } } },
    });
    if (!workspace) return { connected: false, linked: false };
    return { connected: true, linked: workspace.channelRoutes.length > 0 };
  } catch {
    return { connected: false, linked: false };
  }
}

/**
 * Post one job message into the job's Slack thread, creating the thread on
 * first use. At-least-once: chat.postMessage has no idempotency key, so a
 * worker that crashes between Slack accepting the reply and the delivery row
 * finishing can post it twice on retry. Two first messages for the same job
 * racing can each post a parent; the unique jobId keeps one thread and the
 * loser replies into it.
 */
export async function deliverToJobThread(
  orgId: string,
  workspace: { id: string; accessToken: string },
  input: { text: string; jobThread: JobThreadPayload },
): Promise<JobThreadDeliveryResult> {
  const { jobId, headerText, headerBlocks } = input.jobThread;
  let thread = await prisma.slackJobThread.findUnique({ where: { jobId } });

  if (!thread) {
    const route = await prisma.slackChannelRoute.findUnique({
      where: { workspaceId_eventType: { workspaceId: workspace.id, eventType: JOB_MESSAGE_EVENT } },
      select: { channelId: true },
    });
    if (!route) {
      return { delivered: false, retryable: false, error: `No Slack channel is routed for ${JOB_MESSAGE_EVENT}` };
    }
    const parent = await slackPostMessage(workspace.accessToken, {
      channel: route.channelId,
      text: headerText,
      ...(headerBlocks?.length ? { blocks: headerBlocks } : {}),
    });
    if (!parent.ok || !parent.data?.ts) return classify(parent, "chat.postMessage (thread parent) failed");
    try {
      thread = await prisma.slackJobThread.create({
        data: {
          orgId,
          jobId,
          workspaceId: workspace.id,
          channelId: parent.data.channel ?? route.channelId,
          threadTs: parent.data.ts,
        },
      });
    } catch {
      thread = await prisma.slackJobThread.findUnique({ where: { jobId } });
      if (!thread) return { delivered: false, retryable: true, error: "Could not record the job's Slack thread" };
    }
  }

  const reply = await slackPostMessage(workspace.accessToken, {
    channel: thread.channelId,
    text: input.text,
    thread_ts: thread.threadTs,
  });
  if (!reply.ok) return classify(reply, "chat.postMessage (thread reply) failed");
  return { delivered: true, retryable: false, providerMessageId: reply.data?.ts };
}

// ── Inbound ─────────────────────────────────────────────────────────────────

interface SlackMessageEvent {
  type?: unknown;
  subtype?: unknown;
  bot_id?: unknown;
  app_id?: unknown;
  user?: unknown;
  text?: unknown;
  ts?: unknown;
  thread_ts?: unknown;
  channel?: unknown;
}

const NAME_CACHE_LIMIT = 500;
const nameCache = new Map<string, string>();

async function authorName(workspaceId: string, token: string, userId: string): Promise<string> {
  const key = `${workspaceId}:${userId}`;
  const cached = nameCache.get(key);
  if (cached) return cached;
  const resolved = await slackUserName(token, userId);
  if (!resolved) return "Slack";
  if (nameCache.size >= NAME_CACHE_LIMIT) {
    const oldest = nameCache.keys().next().value;
    if (oldest !== undefined) nameCache.delete(oldest);
  }
  nameCache.set(key, resolved);
  return resolved;
}

/** Test helper. */
export function clearSlackNameCache(): void {
  nameCache.clear();
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "P2002");
}

export type BridgeOutcome = "bridged" | "duplicate" | "ignored";

/**
 * Turn a human reply in a job's Slack thread into a JobMessage. `orgId` is
 * the org the verified payload's team resolved to — null means the team is
 * unmapped and nothing is written (fail closed). Ignores everything that is
 * not a plain human threaded reply: channel top-level posts, edits/deletes
 * (subtypes), bot and app posts, and our own bot user.
 */
export async function bridgeSlackThreadReply(orgId: string | null, rawEvent: unknown): Promise<BridgeOutcome> {
  if (!orgId || !rawEvent || typeof rawEvent !== "object") return "ignored";
  const event = rawEvent as SlackMessageEvent;
  if (event.type !== "message" || event.subtype !== undefined || event.bot_id !== undefined) return "ignored";
  if (
    typeof event.channel !== "string" ||
    typeof event.ts !== "string" ||
    typeof event.thread_ts !== "string" ||
    typeof event.user !== "string" ||
    typeof event.text !== "string"
  ) {
    return "ignored";
  }
  if (event.thread_ts === event.ts) return "ignored"; // the parent itself
  const body = event.text.trim();
  if (!body) return "ignored";

  const thread = await prisma.slackJobThread.findUnique({
    where: { channelId_threadTs: { channelId: event.channel, threadTs: event.thread_ts } },
    include: { workspace: { select: { id: true, accessToken: true, botUserId: true } } },
  });
  if (!thread || thread.orgId !== orgId) return "ignored";
  if (thread.workspace.botUserId && event.user === thread.workspace.botUserId) return "ignored";

  const sender = await authorName(thread.workspace.id, thread.workspace.accessToken, event.user);
  let message;
  try {
    message = await prisma.jobMessage.create({
      data: {
        orgId,
        jobId: thread.jobId,
        direction: "dispatch",
        sender,
        body: body.slice(0, 2_000),
        source: "slack",
        slackTs: event.ts,
      },
    });
  } catch (error) {
    // Slack re-delivers events it thinks we missed; the (jobId, slackTs)
    // unique makes the second delivery a no-op.
    if (isUniqueViolation(error)) return "duplicate";
    throw error;
  }

  publishToOrg({
    topic: "topic/jobs/message",
    orgId,
    jobId: thread.jobId,
    message: {
      id: message.id,
      direction: "dispatch",
      sender: message.sender,
      body: message.body,
      source: "slack",
      opId: null,
      createdAt: message.createdAt.toISOString(),
    },
  });
  return "bridged";
}
