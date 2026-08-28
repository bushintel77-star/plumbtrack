import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "@plumbtrack/database";

/**
 * Slack Events Mode inbound surface (research §Slack FSM integration).
 *
 * The outbound half already exists — domain events render to Block Kit and
 * drain through the DB-backed integration worker with exponential backoff.
 * This route completes the loop: slash commands and interactive block
 * actions posted by Slack update the FSM directly.
 *
 * Security posture:
 *  - Disabled by default. The route 503s until SLACK_VERIFICATION_TOKEN is
 *    configured (credentials live only in the server env).
 *  - Every payload's verification token is compared timing-safely.
 *  - Zero outbound requests: card rewrites ride Slack's block-action
 *    response protocol, so no URL from a payload ever reaches fetch.
 */

const ACTION_ACCEPT_PREFIX = "accept_job_";

/** Slack-facing status words → Prisma JobStatus. */
const STATUS_WORDS: Record<string, "scheduled" | "in_progress" | "completed"> = {
  scheduled: "scheduled",
  queued: "scheduled",
  in_progress: "in_progress",
  en_route: "in_progress",
  on_site: "in_progress",
  active: "in_progress",
  completed: "completed",
  complete: "completed",
  done: "completed",
};

function verificationToken(): string | null {
  const token = process.env.SLACK_VERIFICATION_TOKEN?.trim();
  return token || null;
}

function tokenMatches(candidate: unknown): boolean {
  const expected = verificationToken();
  if (!expected || typeof candidate !== "string") return false;
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Parse `application/x-www-form-urlencoded` payloads (slash commands,
 * interactivity) — registered locally so the global app config is untouched. */
function parseFormEncoded(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const out: Record<string, string> = {};
  for (const [key, value] of params.entries()) out[key] = value;
  return out;
}

/**
 * Interactive block-action responses use Slack's native message-replacement
 * protocol: the JSON body returned from this POST rewrites the source card
 * in place. No outbound request (and therefore no URL derived from the
 * payload) is needed — the FSM mutation and the card rewrite are one
 * round-trip.
 */

interface SlackAction {
  action_id?: string;
}

interface SlackInteractivityPayload {
  token?: string;
  response_url?: string;
  user?: { username?: string; name?: string };
  actions?: SlackAction[];
}

function ephemeral(text: string): { response_type: string; text: string } {
  return { response_type: "ephemeral", text };
}

export async function slackEventRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => done(null, parseFormEncoded(String(body)))
  );

  app.get("/status", async () => ({
    enabled: verificationToken() !== null,
    commands: ["/dispatch-status", "/dispatch-help"],
  }));

  app.post("/events", async (request, reply) => {
    const token = verificationToken();
    if (!token) {
      return reply.code(503).send({ error: "Slack events endpoint disabled — SLACK_VERIFICATION_TOKEN is not configured" });
    }

    const body = request.body as Record<string, unknown>;

    // Events API handshake: Slack verifies the endpoint by challenge echo.
    if (body?.type === "url_verification" && typeof body.challenge === "string") {
      if (!tokenMatches(body.token)) return reply.code(401).send({ error: "invalid token" });
      return { challenge: body.challenge };
    }

    // Interactive block action — action_id carries the FSM job id
    // (`accept_job_{id}`), exactly the Block Kit mapping contract.
    if (typeof body?.payload === "string") {
      let payload: SlackInteractivityPayload;
      try {
        payload = JSON.parse(body.payload) as SlackInteractivityPayload;
      } catch {
        return reply.code(400).send({ error: "malformed payload" });
      }
      if (!tokenMatches(payload.token)) return reply.code(401).send({ error: "invalid token" });

      const action = payload.actions?.[0];
      if (action?.action_id?.startsWith(ACTION_ACCEPT_PREFIX)) {
        const jobId = action.action_id.slice(ACTION_ACCEPT_PREFIX.length);
        const claimedBy = payload.user?.name ?? payload.user?.username ?? "slack";
        const updated = await prisma.job.updateMany({
          where: { id: jobId, status: "scheduled" },
          data: { status: "in_progress" },
        });
        if (updated.count === 0) {
          return reply.code(200).send({
            replace_original: false,
            response_type: "ephemeral",
            text: `⚠️ Could not accept ${jobId} — job not found or no longer claimable.`,
          });
        }
        // The response body rewrites the dispatch card in place (Slack
        // block-action protocol) — claim visible to the whole channel.
        return reply.code(200).send({
          replace_original: true,
          text: `✅ Job ${jobId} accepted by *${claimedBy}* — status moved to in progress. The FSM board is updated.`,
        });
      }
      return reply.code(200).send({});
    }

    // Slash command surface.
    if (typeof body?.command === "string") {
      if (!tokenMatches(body.token)) return reply.code(401).send({ error: "invalid token" });
      const text = typeof body.text === "string" ? body.text.trim() : "";

      if (body.command === "/dispatch-help") {
        return ephemeral(
          "*Dispatch commands*\n• `/dispatch-status {jobId} {scheduled|in_progress|completed}` — update a job from the field\n• Accept buttons on dispatch cards claim jobs directly.",
        );
      }

      if (body.command === "/dispatch-status") {
        const match = /^(\S+)\s+(\S+)$/.exec(text);
        if (!match) {
          return ephemeral("Usage: `/dispatch-status {jobId} {scheduled|in_progress|completed}`");
        }
        const [, jobId, statusWord] = match;
        const status = STATUS_WORDS[statusWord.toLowerCase()];
        if (!status) {
          return ephemeral(`Unknown status “${statusWord}”. Try scheduled, in_progress or completed.`);
        }
        const updated = await prisma.job.updateMany({ where: { id: jobId }, data: { status } });
        if (updated.count === 0) {
          return ephemeral(`No job found with id “${jobId}”.`);
        }
        return { response_type: "in_channel", text: `✓ Job ${jobId} → ${status}` };
      }

      return ephemeral(`Unknown command ${body.command}. Try /dispatch-help.`);
    }

    // Events API callbacks (job messages etc.) — ack immediately; outbound
    // fan-out stays on the domain-event worker.
    if (typeof body?.type === "string") {
      if (!tokenMatches(body.token)) return reply.code(401).send({ error: "invalid token" });
      return reply.code(200).send({});
    }

    return reply.code(400).send({ error: "unrecognized Slack payload" });
  });
}
