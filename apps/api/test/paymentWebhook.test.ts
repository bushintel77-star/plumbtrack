import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";

const { jobUpdateMany, jobFindFirst, auditCreate } = vi.hoisted(() => ({
  jobUpdateMany: vi.fn(),
  jobFindFirst: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    job: { updateMany: jobUpdateMany, findFirst: jobFindFirst },
    auditEvent: { create: auditCreate },
  },
}));

import { buildApp } from "../src/server";

const SECRET = "whsec_test_secret";

/** Build a Stripe-style signed header for an exact payload string. */
function stripeHeader(payload: string, timestampSeconds = Math.floor(Date.now() / 1000)): string {
  const expected = createHmac("sha256", SECRET).update(`${timestampSeconds}.${payload}`).digest("hex");
  return `t=${timestampSeconds},v1=${expected}`;
}

describe("POST /api/webhooks/stripe", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    auditCreate.mockResolvedValue({ id: "audit-1" });
    jobFindFirst.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("is disabled (503) while STRIPE_WEBHOOK_SECRET is unset", async () => {
    const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_1", metadata: { job_id: "j1" } } } });
    const response = await app.inject({
      method: "POST",
      url: "/api/webhooks/stripe",
      headers: { "content-type": "application/json", "stripe-signature": stripeHeader(payload) },
      payload,
    });
    expect(response.statusCode).toBe(503);
  });

  it("accepts a correctly signed checkout.session.completed and marks the job paid", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    jobUpdateMany.mockResolvedValue({ count: 1 });
    const payload = JSON.stringify({
      id: "evt_ok",
      type: "checkout.session.completed",
      data: { object: { id: "cs_ok", payment_status: "paid", metadata: { job_id: "job-1" } } },
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/webhooks/stripe",
      headers: { "content-type": "application/json", "stripe-signature": stripeHeader(payload) },
      payload,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ received: true, eventId: "evt_ok" });
    expect(jobUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1", stripeSessionId: "cs_ok" },
        data: { paymentStatus: "paid" },
      }),
    );
  });

  it("audits the paymentStatus mutation in the job's org scope", async () => {
    // The webhook is tenant-hook exempt — the route resolves the job's org
    // so the audit row lands in the right tenant.
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    jobFindFirst.mockResolvedValue({ id: "job-1", orgId: "org-webhook" });
    jobUpdateMany.mockResolvedValue({ count: 1 });
    const payload = JSON.stringify({
      id: "evt_audit",
      type: "checkout.session.completed",
      data: { object: { id: "cs_audit", payment_status: "paid", metadata: { job_id: "job-1" } } },
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/webhooks/stripe",
      headers: { "content-type": "application/json", "stripe-signature": stripeHeader(payload) },
      payload,
    });
    expect(response.statusCode).toBe(200);
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org-webhook",
        action: "payment.status_changed",
        entityType: "job",
        entityId: "job-1",
        metadataJson: expect.stringContaining('"paymentStatus":"paid"'),
      }),
    });
  });

  it("rejects a signature computed over a different body (400)", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const payload = JSON.stringify({ id: "evt_t", type: "checkout.session.completed", data: { object: { id: "cs_t", metadata: { job_id: "j" } } } });
    const response = await app.inject({
      method: "POST",
      url: "/api/webhooks/stripe",
      headers: { "content-type": "application/json", "stripe-signature": stripeHeader(payload) },
      payload: payload.replace("evt_t", "evt_OTHER"),
    });
    expect(response.statusCode).toBe(400);
    expect(jobUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects a stale timestamp (replay window, 400)", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const payload = JSON.stringify({ id: "evt_old", type: "checkout.session.completed", data: { object: { id: "cs_old", metadata: { job_id: "j" } } } });
    const stale = Math.floor(Date.now() / 1000) - 60 * 10;
    const response = await app.inject({
      method: "POST",
      url: "/api/webhooks/stripe",
      headers: { "content-type": "application/json", "stripe-signature": stripeHeader(payload, stale) },
      payload,
    });
    expect(response.statusCode).toBe(400);
    expect(jobUpdateMany).not.toHaveBeenCalled();
  });

  it("ignores unrelated event types without touching jobs", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const payload = JSON.stringify({ id: "evt_irrelevant", type: "invoice.paid", data: { object: { id: "in_1" } } });
    const response = await app.inject({
      method: "POST",
      url: "/api/webhooks/stripe",
      headers: { "content-type": "application/json", "stripe-signature": stripeHeader(payload) },
      payload,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: true });
    expect(jobUpdateMany).not.toHaveBeenCalled();
  });
});
