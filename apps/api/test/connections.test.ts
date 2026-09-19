import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const mocks = vi.hoisted(() => ({
  connectionFindMany: vi.fn(),
  connectionUpsert: vi.fn(),
  connectionUpdateMany: vi.fn(),
  connectionDeleteMany: vi.fn(),
  interestFindMany: vi.fn(),
  interestUpsert: vi.fn(),
  authCreate: vi.fn(),
  authFindUnique: vi.fn(),
  authUpdate: vi.fn(),
  slackFindFirst: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    integrationConnection: {
      findMany: mocks.connectionFindMany,
      upsert: mocks.connectionUpsert,
      updateMany: mocks.connectionUpdateMany,
      deleteMany: mocks.connectionDeleteMany,
    },
    integrationInterest: { findMany: mocks.interestFindMany, upsert: mocks.interestUpsert },
    oAuthAuthorization: { create: mocks.authCreate, findUnique: mocks.authFindUnique, update: mocks.authUpdate },
    slackWorkspace: { findFirst: mocks.slackFindFirst },
    auditEvent: { create: mocks.auditCreate },
  },
}));

import { buildApp } from "../src/server";
import { issueAuthToken, type OrganizationRole } from "../src/lib/auth";
import { decryptSecret } from "../src/lib/secrets";

const ORG = "org-connections-test";
const STRIPE_KEY = "sk_test_51QbcdeFGHIJklmnop";
const bearer = (role: OrganizationRole) => `Bearer ${issueAuthToken({ userId: "u-owner", organizationId: ORG, role })}`;
const originalFetch = globalThis.fetch;

describe("integration connections", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    process.env.PUBLIC_API_BASE_URL = "https://api.crewline.test";
    process.env.HQ_APP_URL = "https://hq.crewline.test";
    app = await buildApp({ logger: false });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    delete process.env.APP_ENCRYPTION_KEY;
    delete process.env.PUBLIC_API_BASE_URL;
    delete process.env.HQ_APP_URL;
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectionFindMany.mockResolvedValue([]);
    mocks.interestFindMany.mockResolvedValue([]);
    mocks.slackFindFirst.mockResolvedValue(null);
    mocks.auditCreate.mockResolvedValue({ id: "audit-1" });
    mocks.connectionUpsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({ id: "conn-1", ...create }));
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.XERO_CLIENT_ID;
    delete process.env.XERO_CLIENT_SECRET;
  });

  it("lists every provider with an honest status and reason", async () => {
    const response = await app.inject({ method: "GET", url: "/api/integrations", headers: { authorization: bearer("owner") } });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.credentialStorageReady).toBe(true);
    const stripe = body.providers.find((p: { id: string }) => p.id === "stripe");
    const xero = body.providers.find((p: { id: string }) => p.id === "xero");
    const square = body.providers.find((p: { id: string }) => p.id === "square");

    // An operator-supplied key is always possible; OAuth needs this
    // deployment to hold client credentials; "planned" never offers Connect.
    expect(stripe).toMatchObject({ available: true, status: "not_connected", canTestConnection: true });
    expect(stripe.fields[0]).toMatchObject({ id: "secretKey", secret: true });
    expect(xero).toMatchObject({ available: false, status: "unavailable" });
    expect(xero.unavailableReason).toMatch(/XERO_CLIENT_ID/);
    expect(square).toMatchObject({ available: false, authType: "none" });
  });

  it("checks a pasted key with the provider and stores nothing on a test", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ business_profile: { name: "Caulfield South Plumbing" } }), { status: 200 })) as typeof fetch;

    const response = await app.inject({
      method: "POST",
      url: "/api/integrations/stripe/test",
      headers: { authorization: bearer("owner") },
      payload: { fields: { secretKey: STRIPE_KEY } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, accountLabel: "Caulfield South Plumbing", checked: true });
    expect(mocks.connectionUpsert).not.toHaveBeenCalled();
  });

  it("stores the key encrypted once the provider accepts it", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ business_profile: { name: "Caulfield South Plumbing" } }), { status: 200 })) as typeof fetch;

    const response = await app.inject({
      method: "POST",
      url: "/api/integrations/stripe/api-key",
      headers: { authorization: bearer("owner") },
      payload: { fields: { secretKey: STRIPE_KEY } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "connected", accountLabel: "Caulfield South Plumbing" });
    const stored = mocks.connectionUpsert.mock.calls[0][0].create.apiKeyEnc as string;
    expect(stored).not.toContain(STRIPE_KEY);
    expect(JSON.parse(decryptSecret(stored))).toEqual({ secretKey: STRIPE_KEY });
  });

  it("refuses a key the provider rejects, and saves nothing", async () => {
    globalThis.fetch = (async () => new Response("{}", { status: 401 })) as typeof fetch;

    const response = await app.inject({
      method: "POST",
      url: "/api/integrations/stripe/api-key",
      headers: { authorization: bearer("owner") },
      payload: { fields: { secretKey: STRIPE_KEY } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toMatch(/rejected that key/i);
    expect(mocks.connectionUpsert).not.toHaveBeenCalled();
  });

  it("catches an obviously wrong key format before calling the provider", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const response = await app.inject({
      method: "POST",
      url: "/api/integrations/stripe/api-key",
      headers: { authorization: bearer("owner") },
      payload: { fields: { secretKey: "pk_live_not_a_secret_key" } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ field: "secretKey" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("starts OAuth with a PKCE challenge and keeps the verifier server-side", async () => {
    process.env.XERO_CLIENT_ID = "xero-client";
    mocks.authCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "auth-1", ...data }));

    const response = await app.inject({
      method: "GET",
      url: "/api/integrations/xero/oauth/start?returnTo=/setup",
      headers: { authorization: bearer("owner") },
    });

    expect(response.statusCode).toBe(200);
    const url = new URL(response.json().url);
    expect(url.origin + url.pathname).toBe("https://login.xero.com/identity/connect/authorize");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe("https://api.crewline.test/api/integrations/oauth/callback/xero");

    const stored = mocks.authCreate.mock.calls[0][0].data;
    expect(stored.state).toBe(url.searchParams.get("state"));
    // The verifier is stored encrypted, and the challenge is not the verifier.
    expect(stored.verifierEnc).not.toContain(url.searchParams.get("code_challenge"));
    expect(decryptSecret(stored.verifierEnc as string).length).toBeGreaterThanOrEqual(43);
  });

  it("says the provider isn't set up rather than starting a flow that can't finish", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/integrations/xero/oauth/start",
      headers: { authorization: bearer("owner") },
    });
    expect(response.statusCode).toBe(503);
    expect(mocks.authCreate).not.toHaveBeenCalled();
  });

  it("sends the operator back with the outcome when they decline at the provider", async () => {
    mocks.authFindUnique.mockResolvedValue({
      id: "auth-1",
      orgId: ORG,
      provider: "xero",
      state: "state-1",
      verifierEnc: "x",
      redirectUri: "https://api.crewline.test/api/integrations/oauth/callback/xero",
      returnTo: "/setup",
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      createdBy: "u-owner",
    });

    const response = await app.inject({ method: "GET", url: "/api/integrations/oauth/callback/xero?state=state-1&error=access_denied" });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("https://hq.crewline.test/setup?provider=xero&connection=denied");
    expect(mocks.authUpdate).toHaveBeenCalled();
  });

  it("answers the OAuth callback without a session even when the legacy fallback is off", async () => {
    // The route's real authorization is the single-use signed state row —
    // gating it on a session cookie would silently fail a connection whose
    // cookie expired mid-round-trip. Production mode must still reach it.
    mocks.authFindUnique.mockResolvedValue(null);
    const previousNodeEnv = process.env.NODE_ENV;
    const previousLegacy = process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER;
    delete process.env.NODE_ENV;
    delete process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER;

    const response = await app.inject({
      method: "GET",
      url: "/api/integrations/oauth/callback/xero?state=not-a-real-state",
    });

    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousLegacy === undefined) delete process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER;
    else process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER = previousLegacy;

    // An unknown state lands the operator on the "failed" outcome redirect —
    // never a 401 from the tenant hook.
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain("connection=failed");
  });

  it("keeps a '//evil.com' returnTo on the HQ origin — protocol-relative is not a path", async () => {
    mocks.authFindUnique.mockResolvedValue({
      id: "auth-1",
      orgId: ORG,
      provider: "xero",
      state: "state-1",
      verifierEnc: "x",
      redirectUri: "https://api.crewline.test/api/integrations/oauth/callback/xero",
      returnTo: "//evil.com",
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      createdBy: "u-owner",
    });

    const response = await app.inject({ method: "GET", url: "/api/integrations/oauth/callback/xero?state=state-1&error=access_denied" });

    expect(response.statusCode).toBe(302);
    const location = new URL(response.headers.location as string);
    expect(location.origin).toBe("https://hq.crewline.test");
    expect(location.searchParams.get("connection")).toBe("denied");
  });

  it("refuses a replayed or expired authorization", async () => {
    mocks.authFindUnique.mockResolvedValue({
      id: "auth-1", orgId: ORG, provider: "xero", state: "state-1", verifierEnc: "x",
      redirectUri: "https://api.crewline.test/api/integrations/oauth/callback/xero",
      returnTo: "/setup", expiresAt: new Date(Date.now() - 1_000), consumedAt: null, createdBy: null,
    });

    const response = await app.inject({ method: "GET", url: "/api/integrations/oauth/callback/xero?state=state-1&code=abc" });

    expect(response.headers.location).toContain("connection=failed");
    expect(mocks.connectionUpsert).not.toHaveBeenCalled();
  });

  it("records interest instead of pretending a planned provider can connect", async () => {
    mocks.interestUpsert.mockResolvedValue({ id: "int-1" });
    const response = await app.inject({
      method: "POST",
      url: "/api/integrations/square/interest",
      headers: { authorization: bearer("owner") },
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    expect(mocks.interestUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { orgId_provider: { orgId: ORG, provider: "square" } },
    }));
  });

  it("disconnects a connected provider", async () => {
    mocks.connectionDeleteMany.mockResolvedValue({ count: 1 });
    const response = await app.inject({
      method: "DELETE",
      url: "/api/integrations/stripe",
      headers: { authorization: bearer("owner") },
    });
    expect(response.statusCode).toBe(204);
  });

  it("keeps connecting and disconnecting to owners and admins", async () => {
    for (const role of ["dispatcher", "manager", "technician"] as const) {
      const response = await app.inject({
        method: "POST",
        url: "/api/integrations/stripe/api-key",
        headers: { authorization: bearer(role) },
        payload: { fields: { secretKey: STRIPE_KEY } },
      });
      expect(response.statusCode).toBe(403);
    }
    expect(mocks.connectionUpsert).not.toHaveBeenCalled();
  });
});
