/**
 * Provider-neutral transactional email — Resend is the first adapter,
 * implemented over its HTTPS API directly (no SDK). Any other provider can
 * be added behind the same `sendEmail` contract by swapping env keys +
 * endpoint. Like the SMS adapter, delivery is best-effort: unconfigured
 * returns a marked result, never a fake "sent".
 */

export interface EmailResult {
  delivered: boolean;
  /** "live" when backed by a real provider call; "test" when unconfigured. */
  mode: "live" | "test";
  providerMessageId?: string;
}

function config() {
  return {
    apiKey: process.env.RESEND_API_KEY?.trim(),
    from: process.env.EMAIL_FROM?.trim(),
  };
}

export function isEmailConfigured(): boolean {
  const { apiKey, from } = config();
  return Boolean(apiKey && from);
}

/** Send a plain-text email. Returns a marked test result (not an error) when
 *  no provider is configured, so flows are exercisable before credentials
 *  exist — callers surface `mode` honestly. */
export async function sendEmail(to: string, subject: string, text: string): Promise<EmailResult> {
  const { apiKey, from } = config();
  if (!apiKey || !from) {
    return { delivered: false, mode: "test" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error(`Email provider send failed (${response.status})`);
  }
  const result = (await response.json()) as { id?: string };
  return { delivered: true, mode: "live", providerMessageId: result.id };
}
