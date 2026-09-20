import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * P1-1 — server-authoritative payment amounts. The payment-link endpoint
 * prices exclusively from the job's accepted quote with the one documented
 * rule (lib/pricing.ts: per-line cents rounding, GST 10% on the rounded
 * subtotal); a client-sent amount is rejected; a job without an accepted
 * quote gets 409, never a link. Stripe return URLs are required in
 * production whenever a Stripe key exists (assertPaymentsConfiguration).
 */

const { jobFindFirst, jobUpdate, auditCreate } = vi.hoisted(() => ({
  jobFindFirst: vi.fn(),
  jobUpdate: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    job: { findFirst: jobFindFirst, update: jobUpdate },
    auditEvent: { create: auditCreate },
  },
}));

import { buildApp } from "../src/server";
import { issueAuthToken } from "../src/lib/auth";
import { quoteTotalsCents } from "../src/lib/pricing";
import { assertPaymentsConfiguration } from "../src/lib/payments";

const ORG = "org-payments-test";
const bearer = (role: string) =>
  `Bearer ${issueAuthToken({ userId: "user-1", organizationId: ORG, role: role as never })}`;

const ORIGINAL_FETCH = globalThis.fetch;

/** An accepted quote whose lines sum to $1,008.00 → GST $100.80 → $1,108.80. */
const ACCEPTED_QUOTE_JOB = {
  id: "job-1",
  orgId: ORG,
  client: "Test Client",
  scope: "Quoted work",
  quote: {
    id: "quote-1",
    status: "accepted",
    lines: [
      { id: "li-1", desc: "Copper re-route, 22 ft", qty: 22, rate: 34, sortOrder: 0 },
      { id: "li-2", desc: "Wall patch + finish", qty: 1, rate: 260, sortOrder: 1 },
    ],
  },
};

function stripeFetchStub(calls: { body: string }[]) {
  return (async (url: unknown, init?: { body?: string }) => {
    calls.push({ body: String(init?.body ?? "") });
    return new Response(JSON.stringify({ url: "https://checkout.stripe.com/c/pay/test", id: "cs_test_1" }), {
      status: 200,
    });
  }) as unknown as typeof fetch;
}

describe("quoteTotalsCents — the single pricing rule", () => {
  it("rounds each line to cents first, then GST on the rounded subtotal", () => {
    // 22 × $34 = $748.00 and 1 × $260.00 = $260.00 → subtotal 100800c.
    const totals = quoteTotalsCents([
      { qty: 22, rate: 34 },
      { qty: 1, rate: 260 },
    ]);
    expect(totals).toEqual({ subtotalCents: 100800, gstCents: 10080, totalCents: 110880 });
  });

  it("half-cent line amounts round half-up per line, not on the total", () => {
    // 3 × $0.335 = $1.005 → 100.5c per line → 101c each (three lines, not a
    // pooled 301.5 → 302): the rule is per-line rounding.
    const totals = quoteTotalsCents([
      { qty: 3, rate: 0.335 },
      { qty: 3, rate: 0.335 },
      { qty: 3, rate: 0.335 },
    ]);
    expect(totals.subtotalCents).toBe(303);
    expect(totals.gstCents).toBe(30);
    expect(totals.totalCents).toBe(333);
  });

  it("GST itself rounds to whole cents on the rounded subtotal", () => {
    const totals = quoteTotalsCents([{ qty: 1, rate: 100.55 }]);
    expect(totals.subtotalCents).toBe(10055);
    expect(totals.gstCents).toBe(1006); // 1005.5 → 1006
    expect(totals.totalCents).toBe(11061);
  });

  it("an empty quote prices to zero", () => {
    expect(quoteTotalsCents([])).toEqual({ subtotalCents: 0, gstCents: 0, totalCents: 0 });
  });
});

describe("POST /api/jobs/:id/payment-link — server-priced", () => {
  let app: FastifyInstance;
  const stripeCalls: { body: string }[] = [];

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fixture_key";
    process.env.PAYMENT_SUCCESS_URL = "https://e2e.test/success";
    process.env.PAYMENT_CANCEL_URL = "https://e2e.test/cancel";
    globalThis.fetch = stripeFetchStub(stripeCalls);
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.PAYMENT_SUCCESS_URL;
    delete process.env.PAYMENT_CANCEL_URL;
    globalThis.fetch = ORIGINAL_FETCH;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    stripeCalls.length = 0;
    jobUpdate.mockResolvedValue({});
    auditCreate.mockResolvedValue({});
  });

  it("prices from the accepted quote and ignores nothing — a client amount is rejected", async () => {
    jobFindFirst.mockResolvedValue(ACCEPTED_QUOTE_JOB);
    const withAmount = await app.inject({
      method: "POST",
      url: "/api/jobs/job-1/payment-link",
      headers: { authorization: bearer("dispatcher") },
      payload: { amount: 1 },
    });
    expect(withAmount.statusCode).toBe(400);
    expect(withAmount.json().message).toMatch(/no body/i);

    const clean = await app.inject({
      method: "POST",
      url: "/api/jobs/job-1/payment-link",
      headers: { authorization: bearer("dispatcher") },
    });
    expect(clean.statusCode).toBe(200);
    expect(clean.json()).toMatchObject({
      amount: 1108.8,
      subtotalCents: 100800,
      gstCents: 10080,
      totalCents: 110880,
      currency: "AUD",
    });
    // The Stripe call carried the server-computed total, in cents (the
    // form key is URL-encoded: unit_amount%5D=...).
    expect(stripeCalls).toHaveLength(1);
    expect(stripeCalls[0].body).toContain("unit_amount%5D=110880");
  });

  it("409s on a draft quote, a sent quote, a quoteless job, and an empty accepted quote", async () => {
    for (const job of [
      { ...ACCEPTED_QUOTE_JOB, quote: { ...ACCEPTED_QUOTE_JOB.quote, status: "draft" } },
      { ...ACCEPTED_QUOTE_JOB, quote: { ...ACCEPTED_QUOTE_JOB.quote, status: "sent" } },
      { ...ACCEPTED_QUOTE_JOB, quote: null },
      {
        ...ACCEPTED_QUOTE_JOB,
        quote: { ...ACCEPTED_QUOTE_JOB.quote, status: "accepted", lines: [] },
      },
    ]) {
      jobFindFirst.mockResolvedValue(job);
      const res = await app.inject({
        method: "POST",
        url: "/api/jobs/job-1/payment-link",
        headers: { authorization: bearer("dispatcher") },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().message).toMatch(/no accepted quote/i);
    }
    expect(stripeCalls).toHaveLength(0);
    expect(jobUpdate).not.toHaveBeenCalled();
  });

  it("404s a foreign-org job and 403s a non-field role", async () => {
    jobFindFirst.mockResolvedValue(null);
    const missing = await app.inject({
      method: "POST",
      url: "/api/jobs/job-1/payment-link",
      headers: { authorization: bearer("dispatcher") },
    });
    expect(missing.statusCode).toBe(404);

    jobFindFirst.mockResolvedValue(ACCEPTED_QUOTE_JOB);
    const accountant = await app.inject({
      method: "POST",
      url: "/api/jobs/job-1/payment-link",
      headers: { authorization: bearer("accountant") },
    });
    expect(accountant.statusCode).toBe(403);
  });
});

describe("assertPaymentsConfiguration", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV.NODE_ENV;
    if (ORIGINAL_ENV.STRIPE_SECRET_KEY === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = ORIGINAL_ENV.STRIPE_SECRET_KEY;
    if (ORIGINAL_ENV.PAYMENT_SUCCESS_URL === undefined) delete process.env.PAYMENT_SUCCESS_URL;
    else process.env.PAYMENT_SUCCESS_URL = ORIGINAL_ENV.PAYMENT_SUCCESS_URL;
    if (ORIGINAL_ENV.PAYMENT_CANCEL_URL === undefined) delete process.env.PAYMENT_CANCEL_URL;
    else process.env.PAYMENT_CANCEL_URL = ORIGINAL_ENV.PAYMENT_CANCEL_URL;
  });

  it("refuses a production boot with Stripe configured but return URLs missing", () => {
    process.env.NODE_ENV = "production";
    process.env.STRIPE_SECRET_KEY = "sk_test_fixture_key";
    delete process.env.PAYMENT_SUCCESS_URL;
    delete process.env.PAYMENT_CANCEL_URL;
    expect(assertPaymentsConfiguration).toThrow(/PAYMENT_SUCCESS_URL/);
  });

  it("allows production without Stripe, and production with both URLs set", () => {
    process.env.NODE_ENV = "production";
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.PAYMENT_SUCCESS_URL;
    delete process.env.PAYMENT_CANCEL_URL;
    expect(assertPaymentsConfiguration).not.toThrow();

    process.env.STRIPE_SECRET_KEY = "sk_test_fixture_key";
    process.env.PAYMENT_SUCCESS_URL = "https://real.test/success";
    process.env.PAYMENT_CANCEL_URL = "https://real.test/cancel";
    expect(assertPaymentsConfiguration).not.toThrow();
  });

  it("never fires outside production", () => {
    process.env.NODE_ENV = "test";
    process.env.STRIPE_SECRET_KEY = "sk_test_fixture_key";
    delete process.env.PAYMENT_SUCCESS_URL;
    delete process.env.PAYMENT_CANCEL_URL;
    expect(assertPaymentsConfiguration).not.toThrow();
  });
});
