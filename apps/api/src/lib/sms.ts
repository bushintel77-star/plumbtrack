/**
 * Provider-neutral SMS delivery — Twilio is the first adapter, implemented
 * over the Twilio REST API directly (no SDK): a POST to Messages with basic
 * auth. Any other provider can be added behind the same `sendSms` contract by
 * swapping the env keys + endpoint. Like the Slack webhook relay, delivery is
 * best-effort and never blocks a mutation; failures return a typed result the
 * caller can surface.
 */

export interface SmsResult {
  delivered: boolean;
  /** "live" when backed by a real provider call; "test" when unconfigured. */
  mode: "live" | "test";
  providerMessageId?: string;
}

function config() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID?.trim(),
    authToken: process.env.TWILIO_AUTH_TOKEN?.trim(),
    from: process.env.TWILIO_FROM_NUMBER?.trim(),
  };
}

export function isSmsConfigured(): boolean {
  const { accountSid, authToken, from } = config();
  return Boolean(accountSid && authToken && from);
}

/** Send an SMS. Returns a marked test result (not an error) when Twilio is
 *  unconfigured, so the flow is exercisable before credentials exist. */
export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const { accountSid, authToken, from } = config();
  if (!accountSid || !authToken || !from) {
    return { delivered: false, mode: "test" };
  }

  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!response.ok) {
    throw new Error(`Twilio send failed (${response.status})`);
  }
  const result = (await response.json()) as { sid?: string };
  return { delivered: true, mode: "live", providerMessageId: result.sid };
}
