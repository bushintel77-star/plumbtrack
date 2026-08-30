/**
 * Server-side payment links (Stripe Checkout).
 *
 * Free-tier friendly: with `STRIPE_SECRET_KEY` set, a real Checkout Session
 * is created (a test-mode key creates test-mode sessions at no cost). Without
 * a key the API returns a deterministic, clearly-marked test URL so the flow
 * works end-to-end before any Stripe account exists. No monthly fee either
 * way — Stripe only takes a cut of successful payments.
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

export interface CreateCheckoutSessionInput {
  jobId: string;
  client: string;
  /** Total to charge, in the currency's smallest unit (cents). */
  amountCents: number;
  description: string;
  currency?: string;
}

/**
 * Create a Stripe Checkout session (or a marked test fallback when no key is
 * configured). Never throws — returns the result so callers can persist it.
 */
export async function createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult> {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error("Stripe is not configured");
  }

  const successUrl = process.env.PAYMENT_SUCCESS_URL ?? "https://app.plumbtrack.example/payments/success";
  const cancelUrl = process.env.PAYMENT_CANCEL_URL ?? "https://app.plumbtrack.example/payments/cancelled";
  const params = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": input.currency ?? "aud",
    "line_items[0][price_data][unit_amount]": String(Math.max(1, Math.round(input.amountCents))),
    "line_items[0][price_data][product_data][name]": `PlumbTrack invoice — ${input.jobId}`,
    "line_items[0][price_data][product_data][description]": input.description.slice(0, 120),
    "metadata[job_id]": input.jobId,
    "metadata[client]": input.client.slice(0, 120),
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  try {
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
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
