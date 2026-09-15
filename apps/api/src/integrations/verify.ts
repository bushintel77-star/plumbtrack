/**
 * Credential checks for API-key integrations.
 *
 * "Test connection" in the setup wizard calls the provider with the key the
 * operator just pasted and reports what came back — the account name on
 * success, the provider's own reason on failure. Nothing is stored until a
 * check passes, so an operator never leaves setup believing a wrong key works.
 *
 * Egress is to literal provider origins only, and no credential is ever logged
 * or returned to the client.
 */

export interface VerifyResult {
  ok: boolean;
  /** What the operator sees they connected, e.g. the business name. */
  accountLabel?: string;
  /** Plain-language reason, safe to show. */
  error?: string;
}

const TIMEOUT_MS = 8_000;

function friendlyHttpError(status: number, provider: string): string {
  if (status === 401 || status === 403) return `${provider} rejected that key. Check you copied the whole key and that it's for the right account.`;
  if (status === 404) return `${provider} couldn't find that account. Check the details and try again.`;
  if (status === 429) return `${provider} is rate limiting us right now. Wait a moment and try again.`;
  if (status >= 500) return `${provider} is having trouble right now. Try again shortly.`;
  return `${provider} returned an unexpected response (${status}).`;
}

async function verifyStripe(fields: Record<string, string>): Promise<VerifyResult> {
  const key = fields.secretKey?.trim();
  if (!key) return { ok: false, error: "Paste your Stripe secret key first." };
  try {
    const response = await fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, error: friendlyHttpError(response.status, "Stripe") };
    const account = (await response.json()) as {
      business_profile?: { name?: string };
      settings?: { dashboard?: { display_name?: string } };
      email?: string;
      id?: string;
    };
    const label = account.business_profile?.name ?? account.settings?.dashboard?.display_name ?? account.email ?? account.id;
    return { ok: true, accountLabel: label ?? "Stripe account" };
  } catch {
    return { ok: false, error: "Couldn't reach Stripe. Check your internet connection and try again." };
  }
}

async function verifyTwilio(fields: Record<string, string>): Promise<VerifyResult> {
  const sid = fields.accountSid?.trim();
  const token = fields.authToken?.trim();
  if (!sid || !token) return { ok: false, error: "Enter both the Account SID and the auth token." };
  if (!/^AC[0-9a-fA-F]{32}$/.test(sid)) return { ok: false, error: "That Account SID doesn't look right — it starts with AC and is 34 characters." };
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}.json`, {
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, error: friendlyHttpError(response.status, "Twilio") };
    const account = (await response.json()) as { friendly_name?: string; status?: string };
    if (account.status && account.status !== "active") {
      return { ok: false, error: `That Twilio account is ${account.status}. Use an active account.` };
    }
    return { ok: true, accountLabel: account.friendly_name ?? "Twilio account" };
  } catch {
    return { ok: false, error: "Couldn't reach Twilio. Check your internet connection and try again." };
  }
}

/** Providers with no check available store the key and say so honestly. */
export async function verifyCredentials(providerId: string, fields: Record<string, string>): Promise<VerifyResult> {
  switch (providerId) {
    case "stripe":
      return verifyStripe(fields);
    case "twilio":
      return verifyTwilio(fields);
    default:
      return { ok: true };
  }
}

/** True when "Test connection" can actually reach the provider. */
export function verificationAvailable(providerId: string): boolean {
  return providerId === "stripe" || providerId === "twilio";
}
