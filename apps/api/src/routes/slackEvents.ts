import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
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
 *  - Disabled by default. The route 503s until SLACK_SIGNING_SECRET or the
 *    legacy SLACK_VERIFICATION_TOKEN is configured (credentials live only in
 *    the server env).
 *  - Preferred verification is Slack's HMAC v0 request signing
 *    (SLACK_SIGNING_SECRET): HMAC-SHA256 over `v0:{timestamp}:{rawBody}`
 *    with a ±300s replay window, compared timing-safely. The scoped parsers
 *    below keep the raw body for signature computation on both content
 *    types Slack sends (JSON events, urlencoded commands).
 *  - The legacy verification token (deprecated by Slack, no replay
 *    protection) is still accepted as a fallback so existing deployments
 *    keep working; production logs a warning until SLACK_SIGNING_SECRET is
 *    configured.
 *  - Zero outbound requests: card rewrites ride Slack's block-action
 *    response protocol, so no URL from a payload ever reaches fetch.
 *  - Tenant resolution is fail-closed: a payload whose team cannot be mapped
 *    to an org is refused — job mutations never run unscoped (2026-09-07
 *    audit finding P1-8).
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

function signingSecret(): string | null {
  const secret = process.env.SLACK_SIGNING_SECRET?.trim();
  return secret || null;
}

/** Slack itself rejects replayed requests outside a 5-minute window; so do we. */
const SIGNATURE_TIMESTAMP_TOLERANCE_SECONDS = 300;

/**
 * Verify Slack's `x-slack-signature` HMAC v0 scheme against the raw request
 * body. Returns null when valid, otherwise a machine-readable reason.
 */
function verifySlackSignature(request: FastifyRequest, rawBody: string): string | null {
  const secret = signingSecret();
  if (!secret) return "no signing secret configured";
  const timestamp = request.headers["x-slack-request-timestamp"];
  const signature = request.headers["x-slack-signature"];
  if (typeof timestamp !== "string" || typeof signature !== "string") return "missing signature headers";
  const tsSeconds = Number(timestamp);
  if (!Number.isFinite(tsSeconds)) return "malformed timestamp";
  if (Math.abs(Date.now() / 1000 - tsSeconds) > SIGNATURE_TIMESTAMP_TOLERANCE_SECONDS) return "stale timestamp (replay rejected)";
  const expected = "v0=" + createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return "signature mismatch";
  return null;
}

/**
 * Resolve the org a Slack payload belongs to (§4.6): team_id → SlackWorkspace
 * (one Slack team maps to exactly one org — the payload never picks the org).
 * Falls back to the SLACK_ORG_ID/SLACK_TEAM_ID env pin for deployments that
 * have not connected a workspace. Returns `false` for an explicitly-rejected
 * foreign team, `null` when no mapping exists (callers must treat null as
 * "refuse to mutate" — never mutate unscoped).
 */
async function resolveOrgForTeam(teamId: unknown): Promise<string | null | false> {
  if (typeof teamId !== "string" || teamId === "") return null;
  try {
    const workspace = await prisma.slackWorkspace.findUnique({
      where: { teamId },
      select: { orgId: true },
    });
    if (workspace) return workspace.orgId;
  } catch {
    // Workspace table not migrated yet — env pin below still applies.
  }
  const expectedTeam = process.env.SLACK_TEAM_ID?.trim();
  const envOrg = process.env.SLACK_ORG_ID?.trim();
  if (envOrg) return expectedTeam ? (teamId === expectedTeam ? envOrg : false) : envOrg;
  return null;
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
  team?: { id?: string };
  user?: { username?: string; name?: string };
  actions?: SlackAction[];
}

function ephemeral(text: string): { response_type: string; text: string } {
  return { response_type: "ephemeral", text };
}

const NOT_BOUND_MESSAGE =
  "This Slack workspace is not linked to an organization on this deployment — job actions are disabled until an admin connects it.";

/** Fastify 5 does not attach the pre-parsed body itself — the scoped parsers
 * below stash it here so signature verification sees the exact wire bytes. */
interface RawBodyRequest extends FastifyRequest {
  rawBody?: Buffer | string;
}

export async function slackEventRoutes(app: FastifyInstance): Promise<void> {
  // Scoped parsers so this plugin sees the raw request body (signature
  // verification) without touching the global JSON config used elsewhere.
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (req, body, done) => {
      (req as RawBodyRequest).rawBody = String(body);
      done(null, parseFormEncoded(String(body)));
    }
  );
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body, done) => {
      const raw = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
      (req as RawBodyRequest).rawBody = raw;
      try {
        done(null, JSON.parse(raw.toString("utf8")));
      } catch {
        done(new Error("malformed JSON body"), undefined);
      }
    }
  );

  app.get("/status", async () => ({
    enabled: verificationToken() !== null || signingSecret() !== null,
    signatureVerification: signingSecret() !== null ? "hmac-v0" : verificationToken() !== null ? "legacy-token" : "disabled",
    commands: ["/dispatch-status", "/dispatch-help"],
  }));

  let warnedLegacyInProduction = false;

  app.post("/events", { config: { rawBody: true } }, async (request, reply) => {
    const hasSigningSecret = signingSecret() !== null;
    const hasLegacyToken = verificationToken() !== null;
    if (!hasSigningSecret && !hasLegacyToken) {
      return reply.code(503).send({ error: "Slack events endpoint disabled — SLACK_SIGNING_SECRET (or legacy SLACK_VERIFICATION_TOKEN) is not configured" });
    }

    // Raw body for HMAC verification, captured by the scoped parsers above
    // for both content types Slack sends. Fastify 5 never attaches
    // request.rawBody on its own.
    const rawBody =
      typeof (request as RawBodyRequest).rawBody === "string"
        ? (request as RawBodyRequest).rawBody as string
        : Buffer.isBuffer((request as RawBodyRequest).rawBody)
          ? ((request as RawBodyRequest).rawBody as Buffer).toString("utf8")
          : "";

    // HMAC path is mandatory when the signing secret is configured; the
    // legacy token path (no replay protection) only runs without one.
    if (hasSigningSecret) {
      const signatureError = verifySlackSignature(request, rawBody);
      if (signatureError) return reply.code(401).send({ error: `invalid Slack signature: ${signatureError}` });
    } else if (process.env.NODE_ENV === "production" && !warnedLegacyInProduction) {
      warnedLegacyInProduction = true;
      request.log.warn("Slack inbound is using the deprecated verification token (no replay protection) — configure SLACK_SIGNING_SECRET for HMAC v0 verification");
    }

    const body = request.body as Record<string, unknown>;
    // HMAC-verified requests are authorized wholesale; legacy-token requests
    // must carry the shared token in each top-level payload (the nested
    // interactivity payload re-checks its own token below).
    const authorized = hasSigningSecret ? true : tokenMatches(body?.token);

    // Tenant resolution (see resolveOrgForTeam): the payload's team maps to
    // exactly one org; foreign teams are rejected before any data is touched.
    const bodyOrgScope = await resolveOrgForTeam(body.team_id);
    if (bodyOrgScope === false) {
      return reply.code(403).send({ error: "Slack workspace not bound to this deployment" });
    }
    const orgScope = bodyOrgScope;

    // Events API handshake: Slack verifies the endpoint by challenge echo.
    if (body?.type === "url_verification" && typeof body.challenge === "string") {
      if (!authorized) return reply.code(401).send({ error: "invalid token" });
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
      if (!authorized && !tokenMatches(payload.token)) return reply.code(401).send({ error: "invalid token" });
      const payloadOrgScope = await resolveOrgForTeam(payload.team?.id);
      if (payloadOrgScope === false) return reply.code(403).send({ error: "Slack workspace not bound to this deployment" });
      const interactivityOrgScope = payloadOrgScope ?? orgScope;

      const action = payload.actions?.[0];
      if (action?.action_id?.startsWith(ACTION_ACCEPT_PREFIX)) {
        if (!interactivityOrgScope) return reply.code(200).send(ephemeral(NOT_BOUND_MESSAGE));
        const jobId = action.action_id.slice(ACTION_ACCEPT_PREFIX.length);
        const claimedBy = payload.user?.name ?? payload.user?.username ?? "slack";
        const updated = await prisma.job.updateMany({
          where: { id: jobId, status: "scheduled", orgId: interactivityOrgScope },
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
      if (!authorized) return reply.code(401).send({ error: "invalid token" });
      const text = typeof body.text === "string" ? body.text.trim() : "";

      if (body.command === "/dispatch-help") {
        return ephemeral(
          "*Dispatch commands*\n• `/dispatch-status {jobId} {scheduled|in_progress|completed}` — update a job from the field\n• Accept buttons on dispatch cards claim jobs directly.",
        );
      }

      if (body.command === "/dispatch-status") {
        if (!orgScope) return reply.code(200).send(ephemeral(NOT_BOUND_MESSAGE));
        const match = /^(\S+)\s+(\S+)$/.exec(text);
        if (!match) {
          return ephemeral("Usage: `/dispatch-status {jobId} {scheduled|in_progress|completed}`");
        }
        const [, jobId, statusWord] = match;
        const status = STATUS_WORDS[statusWord.toLowerCase()];
        if (!status) {
          return ephemeral(`Unknown status “${statusWord}”. Try scheduled, in_progress or completed.`);
        }
        const updated = await prisma.job.updateMany({
          where: { id: jobId, orgId: orgScope },
          data: { status },
        });
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
      if (!authorized) return reply.code(401).send({ error: "invalid token" });
      return reply.code(200).send({});
    }

    return reply.code(400).send({ error: "unrecognized Slack payload" });
  });
}
