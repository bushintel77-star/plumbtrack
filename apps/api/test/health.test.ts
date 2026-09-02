import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/server";

/**
 * Health endpoint in PRODUCTION auth mode (the Railway deployment case): the
 * legacy tenant header is rejected, so an unauthenticated request must fail
 * except on /api/health (and the media read routes). A 401 on /api/health
 * would fail Railway's deployment health probe — this suite guards that.
 */
const previousFallback = process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER;
const previousAuthSecret = process.env.AUTH_SECRET;

describe("health endpoint (production auth mode)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.AUTH_SECRET = "health-test-secret";
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    if (previousFallback === undefined) delete process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER;
    else process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER = previousFallback;
    if (previousAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previousAuthSecret;
    await app.close();
  });

  beforeEach(() => {
    process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER = "false";
  });

  it("returns ok unauthenticated even in production auth mode (health probe bypass)", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok" });
  });

  it("reports Slack webhook configuration state", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ slack: { webhookConfigured: false } });
  });

  it("still 401s a protected route without a session in production mode", async () => {
    const response = await app.inject({ method: "GET", url: "/api/jobs" });
    expect(response.statusCode).toBe(401);
  });
});
