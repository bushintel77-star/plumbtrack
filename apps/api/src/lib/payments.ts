/**
 * Server-side payment links (Stripe Checkout).
 *
 * Free-tier friendly: with `STRIPE_SECRET_KEY` set, a real Checkout Session
 * is created (a test-mode key creates test-mode sessions at no cost). Without
 * a key the API returns a deterministic `configured: false` result callers
 * turn into a 503 — the flow states what is missing instead of faking a link.
 * Stripe only ever takes a cut of successful payments.
 */

export interface CheckoutSessionResult {
  /** Checkout URL the client can open or send to the customer. */
  url: string;
  /** "live" only when backed by a real Stripe API call. */
  mode: "live";
  /** Whether a Stripe secret key is configured on the server. */
  configured: boolean
  sessionId?: string;
}

/** True when a Stripe secret key is configured server-side. */
export function isStripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return Boolean(key);
}

/** Fail loud at boot: a deployment that can take real payments must have its
 *  Stripe return URLs configured — the fabricated example domains are gone
 *  (P1-1), and a customer landing on a made-up URL after paying would be a
 *  trust failure, not a bug. Dev/test keep a localhost default and are
 *  exempt. */
export function assertPaymentsConfiguration(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (!isStripeConfigured()) return; // no Stripe → no checkout → no return URL needed
  if (!process.env.PAYMENT_SUCCESS_URL?.trim() || !process.env.PAYMENT_CANCEL_URL?.trim()) {
    throw new Error(
      "PAYMENT_SUCCESS_URL and PAYMENT_CANCEL_URL must be configured when STRIPE_SECRET_KEY is set in production"
    );
  }
}

function paymentReturnUrls(): { successUrl: string; cancelUrl: string } {
  if (process.env.NODE_ENV === "production") {
    return {
      successUrl: process.env.PAYMENT_SUCCESS_URL!.trim(),
      cancelUrl: process.env.PAYMENT_CANCEL_URL!.trim(),
    };
  }
  return {
    successUrl: process.env.PAYMENT_SUCCESS_URL ?? "http://localhost:3001/payments/success",
    cancelUrl: process.env.PAYMENT_CANCEL_URL ?? "http://localhost:3001/payments/cancelled",
  };
}

export interface CreateCheckoutSessionInput {
  jobId: string;
  client: string;
  /** Total to charge, in the currency's smallest unit (cents). Server-computed from the accepted quote. */
  amountCents: number;
  description: string;
  currency?: string;
}

/**
 * Create a Stripe Checkout session. Never throws for a missing key — that is
 * the `configured: false` result callers turn into a 503, not a 500.
 */
export async function createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult> {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    return { url: "", mode: "live", configured: false };
  }

  const { successUrl, cancelUrl } = paymentReturnUrls();
  const params = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": input.currency ?? "aud",
    "line_items[0][price_data][unit_amount]": String(Math.max(1, Math.round(input.amountCents))),
    "line_items[0][price_data][product_data][name]": `Crewline invoice — ${input.jobId}`,
    "line_items[0][price_data][product_data][description]": input.description.slice(0, 120),
    "metadata[job_id]": input.jobId,
    "metadata[client]": input.client.slice(0, 120),
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  try {
    // A hung Stripe connection must not stall the request indefinitely.
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      signal: AbortSignal.timeout(8_000),
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!response.ok) {
      await response.text();
      throw new Error(`Stripe Checkout failed (${response.status})`);
    }
    const session = (await response.json()) as { url?: string; id?: string };
    if (!session.id || !session.url) throw new Error("Stripe returned an incomplete Checkout session");
    return { url: session.url, mode: "live", configured: true, sessionId: session.id };
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("Stripe Checkout request failed");
  }
}
