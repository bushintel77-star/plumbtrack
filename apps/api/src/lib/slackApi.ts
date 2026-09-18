/**
 * Slack Web API client (design §4.6).
 *
 * Everything a real integration needs lives here: the OAuth `oauth.v2.access`
 * code exchange, `chat.postMessage` (outbound automations), `conversations.list`
 * (channel picker) and `conversations.history` (two-way visibility: Crewline
 * reads the team's real Slack messages instead of owning a Message entity).
 *
 * Security posture:
 *  - The workspace access token is stored server-side (SlackWorkspace table)
 *    and NEVER crosses to a client — these functions are the only readers.
 *  - Egress is allowlisted to the literal `https://slack.com/api/...` origin;
 *    no URL is ever assembled from payload data.
 *  - Every call is time-boxed so a hung Slack connection cannot stall a
 *    request or a worker lease.
 */

const SLACK_API_ORIGIN = "https://slack.com/api";

export interface SlackApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  /** HTTP status when the call failed at the transport layer (non-200). */
  httpStatus?: number;
}

async function slackApi<T>(method: string, token: string, body: Record<string, unknown>): Promise<SlackApiResult<T>> {
  try {
    const response = await fetch(`${SLACK_API_ORIGIN}/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      return { ok: false, httpStatus: response.status, error: `Slack API ${method} failed (${response.status})` };
    }
    const data = (await response.json()) as T & { ok: boolean; error?: string };
    if (!data.ok) {
      return { ok: false, data, error: data.error ?? `Slack API ${method} returned ok:false` };
    }
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : `Slack API ${method} failed`,
    };
  }
}

// ── OAuth ────────────────────────────────────────────────────────────────────

export interface SlackOauthV2Access {
  team?: { id?: string; name?: string };
  access_token?: string;
  bot_user_id?: string;
  authed_user?: { id?: string };
}

/** True when this deployment has a Slack app configured (client id + secret). */
export function isSlackOAuthConfigured(): boolean {
  return Boolean(process.env.SLACK_CLIENT_ID?.trim() && process.env.SLACK_CLIENT_SECRET?.trim());
}

/** The Slack authorize URL for the "Connect to Slack" button, or null until
 *  the app credentials are configured server-side. */
export function slackAuthorizeUrl(redirectUri: string, state: string): string | null {
  const clientId = process.env.SLACK_CLIENT_ID?.trim();
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    // users:read names the Slack author of a job-thread reply; installs
    // without it still bridge, attributed as "Slack".
    scope: "chat:write,channels:history,channels:read,groups:history,groups:read,im:history,mpim:history,users:read",
    redirect_uri: redirectUri,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

/** Exchange an OAuth code for a bot token. Called only from the redirect URI. */
export async function exchangeSlackCode(code: string, redirectUri: string): Promise<SlackApiResult<SlackOauthV2Access>> {
  const clientId = process.env.SLACK_CLIENT_ID?.trim();
  const clientSecret = process.env.SLACK_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return { ok: false, error: "slack_oauth_not_configured" };
  try {
    const response = await fetch(`${SLACK_API_ORIGIN}/oauth.v2.access`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      return { ok: false, httpStatus: response.status, error: `oauth.v2.access failed (${response.status})` };
    }
    const data = (await response.json()) as SlackOauthV2Access & { ok: boolean; error?: string };
    if (!data.ok || !data.access_token || !data.team?.id) {
      return { ok: false, data, error: data.error ?? "oauth exchange incomplete" };
    }
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "oauth exchange failed" };
  }
}

// ── Posting + reads ──────────────────────────────────────────────────────────

/** Post a message to a channel via chat.postMessage (`thread_ts` replies
 *  into an existing thread). */
export async function slackPostMessage(
  token: string,
  input: { channel: string; text: string; blocks?: unknown[]; thread_ts?: string }
): Promise<SlackApiResult<{ ts?: string; channel?: string }>> {
  return slackApi("chat.postMessage", token, input);
}

const SLACK_USER_ID = /^[UW][A-Z0-9]+$/;

/** Display name for a Slack user (users.info). Short timeout — this runs
 *  inside Slack's 3-second event acknowledgement window. Null on any failure,
 *  including installs that lack the users:read scope. */
export async function slackUserName(token: string, userId: string, timeoutMs = 1_500): Promise<string | null> {
  if (!SLACK_USER_ID.test(userId)) return null;
  try {
    const response = await fetch(`${SLACK_API_ORIGIN}/users.info?user=${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      ok: boolean;
      user?: { name?: string; real_name?: string; profile?: { display_name?: string; real_name?: string } };
    };
    if (!data.ok || !data.user) return null;
    const name = data.user.profile?.display_name || data.user.profile?.real_name || data.user.real_name || data.user.name;
    return name?.trim() ? name.trim().slice(0, 80) : null;
  } catch {
    return null;
  }
}

export interface SlackChannel {
  id: string;
  name: string;
  /** Channel purpose/Topic folded into one descriptor for the picker. */
  purpose?: string;
  is_private?: boolean;
}

/** List channels the bot can see (conversations.list) — the Channels panel. */
export async function slackListChannels(token: string): Promise<SlackApiResult<{ channels: SlackChannel[] }>> {
  const result = await slackApi<{ channels?: Array<{ id: string; name: string; purpose?: { value?: string }; is_private?: boolean }> }>(
    "conversations.list",
    token,
    { types: "public_channel,private_channel", exclude_archived: true, limit: 200 }
  );
  if (!result.ok || !result.data) return { ok: false, error: result.error };
  return {
    ok: true,
    data: {
      channels: (result.data.channels ?? []).map(channel => ({
        id: channel.id,
        name: channel.name,
        purpose: channel.purpose?.value ?? undefined,
        is_private: channel.is_private,
      })),
    },
  };
}

export interface SlackHistoryMessage {
  /** Slack ts — the message's identity; there is no Crewline Message row. */
  ts: string;
  text: string;
  /** Bot postings from our own automations render with the bot treatment. */
  fromBot: boolean;
  user?: string;
  username?: string;
}

/** Read a channel's recent history (conversations.history) — read-only. */
export async function slackChannelHistory(
  token: string,
  channelId: string,
  limit = 30
): Promise<SlackApiResult<{ messages: SlackHistoryMessage[] }>> {
  const result = await slackApi<{
    messages?: Array<{ ts: string; text?: string; bot_id?: string; user?: string; username?: string; subtype?: string }>;
  }>("conversations.history", token, { channel: channelId, limit });
  if (!result.ok || !result.data) return { ok: false, error: result.error };
  return {
    ok: true,
    data: {
      messages: (result.data.messages ?? [])
        .filter(message => message.subtype === undefined || message.subtype === "bot_text")
        .map(message => ({
          ts: message.ts,
          text: message.text ?? "",
          fromBot: Boolean(message.bot_id),
          user: message.user,
          username: message.username,
        })),
    },
  };
}
