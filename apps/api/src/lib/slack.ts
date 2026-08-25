/**
 * Server-side Slack relay.
 *
 * The incoming-webhook URL is owned here — it is read from the server env
 * (`SLACK_WEBHOOK_URL`) and never shipped to the browser bundle. The web app
 * only talks to the notification dispatcher (`POST /api/notifications`), which
 * routes internally first (Postgres) and then relays to Slack downstream.
 *
 * Egress is allowlisted at the sink: the relay only ever calls a literal
 * `https://hooks.slack.com` origin with a validated `/services/...` path, so a
 * poisoned webhook variable cannot redirect this fetch to internal or
 * third-party endpoints (SSRF).
 */

/** Literal allowlisted origin — the only host this relay may call. */
const SLACK_WEBHOOK_ORIGIN = "https://hooks.slack.com";

/** Slack incoming-webhook paths look like /services/T00000000/B00000000/XXXX. */
const SLACK_WEBHOOK_PATH = /^\/services\/[A-Za-z0-9][A-Za-z0-9/_-]*$/;

/** Webhook hosts accepted from the environment (defence in depth). */
const ALLOWED_WEBHOOK_HOSTS = new Set(["hooks.slack.com", "hooks..slack.com"]);

/** Parse the configured webhook into a safe literal-origin URL, or null. */
function slackWebhookTarget(): URL | null {
  const raw = (process.env.SLACK_WEBHOOK_URL ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== "https:" || !ALLOWED_WEBHOOK_HOSTS.has(host)) return null;
    if (!SLACK_WEBHOOK_PATH.test(parsed.pathname)) return null;
    if (parsed.search || parsed.hash) return null;
    // Rebuild from the literal origin so only the validated path is carried
    // over from the environment.
    return new URL(parsed.pathname, SLACK_WEBHOOK_ORIGIN);
  } catch {
    return null;
  }
}

/** True when a real Slack webhook URL is configured on the server. */
export function isSlackConfigured(): boolean {
  return slackWebhookTarget() !== null;
}

/**
 * Map an in-app channel id to a Slack channel override. App DMs (`dm-*`)
 * carry no override — Slack posts those to the webhook's default channel.
 */
export function slackChannelFor(appChannel: string): string | undefined {
  const channel = appChannel.trim();
  if (!channel || channel.startsWith("dm-")) return undefined;
  return channel.startsWith("#") ? channel : `#${channel}`;
}

export interface SlackRelayResult {
  delivered: boolean;
  error?: string;
}

/**
 * Fire a message at the Slack incoming webhook. Best-effort by contract: never
 * throws — callers persist delivery state from the returned result instead.
 */
export async function relayToSlack(text: string, appChannel?: string, blocks?: unknown[]): Promise<SlackRelayResult> {
  const target = slackWebhookTarget();
  if (!target) {
    return { delivered: false, error: "no valid Slack webhook configured" };
  }

  const body: { text: string; channel?: string; blocks?: unknown[] } = { text };
  if (appChannel) {
    const channel = slackChannelFor(appChannel);
    if (channel) body.channel = channel;
  }
  if (blocks?.length) body.blocks = blocks;

  try {
    const response = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return { delivered: false, error: `Slack webhook failed (${response.status})` };
    }
    return { delivered: true };
  } catch (error) {
    return {
      delivered: false,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
}
