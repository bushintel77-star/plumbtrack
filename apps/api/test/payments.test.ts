import { afterEach, describe, expect, it } from "vitest";
import { createCheckoutSession, isStripeConfigured } from "../src/lib/payments";

const originalFetch = globalThis.fetch;

afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  globalThis.fetch = originalFetch;
});

describe("createCheckoutSession", () => {
  it("fails closed when Stripe is not configured", async () => {
    await expect(createCheckoutSession({
      jobId: "J-1043",
      client: "OC 4021",
      amountCents: 29500,
      description: "Riser leak repair",
    })).rejects.toThrow("Stripe is not configured");
  });

  it("calls the Stripe Checkout API when a key is configured", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    let called = false;
    globalThis.fetch = (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      called = true;
      expect(String(url)).toBe("https://api.stripe.com/v1/checkout/sessions");
      const auth = (init?.headers as Record<string, string>)?.Authorization;
      expect(auth).toBe("Bearer sk_test_123");
      expect(decodeURIComponent(String(init?.body))).toContain("line_items[0][price_data][unit_amount]=29500");
      return {
        ok: true,
        status: 200,
        json: async () => ({ url: "https://checkout.stripe.com/c/pay/cs_live_abc", id: "cs_live_abc" }),
      } as Response;
    }) as typeof fetch;

    const result = await createCheckoutSession({
      jobId: "J-1043",
      client: "OC 4021",
      amountCents: 29500,
      description: "Riser leak repair",
    });
    expect(called).toBe(true);
    expect(result.mode).toBe("live");
    expect(result.configured).toBe(true);
    expect(result.url).toBe("https://checkout.stripe.com/c/pay/cs_live_abc");
  });

  it("fails when the Stripe call fails", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    globalThis.fetch = (async () => ({
      ok: false,
      status: 401,
      text: async () => "Invalid API Key",
    }) as Response) as typeof fetch;

    await expect(createCheckoutSession({
      jobId: "J-1043",
      client: "OC 4021",
      amountCents: 100,
      description: "Test",
    })).rejects.toThrow("Stripe Checkout failed (401)");
  });

  it("isStripeConfigured reflects the environment", () => {
    expect(isStripeConfigured()).toBe(false);
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    expect(isStripeConfigured()).toBe(true);
    process.env.STRIPE_SECRET_KEY = "   ";
    expect(isStripeConfigured()).toBe(false);
  });
});
