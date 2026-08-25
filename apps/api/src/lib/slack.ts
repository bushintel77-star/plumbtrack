/**
 * Server-side Slack relay.
 *
 * The incoming-webhook URL is owned here — it is read from the server env
 * (`SLACK_WEBHOOK_URL`) and never shipped to the browser bundle. The web app
 * only talks to the notification dispatcher (`POST /api/notifications`), which
 * routes internally first (Postgres) and then relays to Slack downstream.
 */

/** True when a real Slack webhook URL is configured on the server. */
export function isSlackConfigured(): boolean {
  return (process.env.SLACK_WEBHOOK_URL ?? "").trim().length > 0;
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
  if (!isSlackConfigured()) {
    return { delivered: false, error: "no webhook configured" };
  }

  const body: { text: string; channel?: string; blocks?: unknown[] } = { text };
  if (appChannel) {
    const channel = slackChannelFor(appChannel);
    if (channel) body.channel = channel;
  }
  if (blocks?.length) body.blocks = blocks;

  try {
    const response = await fetch(process.env.SLACK_WEBHOOK_URL as string, {
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
