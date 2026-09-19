import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const { findFirst, updateMany, findUnique, transaction, createDomainEvent, userFindUnique, membershipFindUnique, orgFindUnique, sessionFindUnique, sessionCreate, sessionUpdateMany } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  findUnique: vi.fn(),
  transaction: vi.fn(),
  createDomainEvent: vi.fn(),
  userFindUnique: vi.fn(),
  membershipFindUnique: vi.fn(),
  orgFindUnique: vi.fn(),
  sessionFindUnique: vi.fn(),
  sessionCreate: vi.fn(),
  sessionUpdateMany: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    job: { findFirst, updateMany, findUnique },
    user: { findUnique: userFindUnique },
    organization: { findUnique: orgFindUnique },
    organizationMembership: { findUnique: membershipFindUnique },
    session: { findUnique: sessionFindUnique, create: sessionCreate, updateMany: sessionUpdateMany },
    domainEventOutbox: { create: createDomainEvent },
    $transaction: transaction,
  },
}));

import { issueAuthToken } from "../src/lib/auth";
import { buildApp } from "../src/server";

const ORG = "org-caulfield";

/** Production rehearsal rejects sid-less tokens, so every minted token binds
 *  to a row in this in-memory session store the prisma mock reads. */
const sessionRows = new Map<string, {
  id: string; userId: string; organizationId: string; role: string;
  issuedAt: Date; expiresAt: Date; lastSeenAt: Date;
  revokedAt: Date | null; revokedReason: string | null;
  userAgent: string | null; ip: string | null;
}>();

function addSessionRow(input: { id: string; userId?: string; organizationId?: string; role: string }): void {
  sessionRows.set(input.id, {
    id: input.id,
    userId: input.userId ?? "user-1",
    organizationId: input.organizationId ?? ORG,
    role: input.role,
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 3600_000),
    lastSeenAt: new Date(),
    revokedAt: null,
    revokedReason: null,
    userAgent: null,
    ip: null,
  });
}

function token(role: "technician" | "manager" = "technician"): string {
  const sid = `sess-${role}`;
  addSessionRow({ id: sid, role });
  return issueAuthToken({ userId: "user-1", organizationId: ORG, role, sessionId: sid });
}

describe("authenticated tenancy and role authorization", () => {
  let app: FastifyInstance;
  const previousLegacySetting = process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER;
  const previousAuthSecret = process.env.AUTH_SECRET;

  beforeAll(async () => {
    process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER = "false";
    process.env.AUTH_SECRET = "test-auth-secret";
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    if (previousLegacySetting === undefined) delete process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER;
    else process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER = previousLegacySetting;
    if (previousAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previousAuthSecret;
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    findFirst.mockResolvedValue({ id: "J-1", orgId: ORG });
    updateMany.mockResolvedValue({ count: 1 });
    findUnique.mockResolvedValue({ id: "J-1", orgId: ORG });
    createDomainEvent.mockResolvedValue({});
    userFindUnique.mockResolvedValue(null);
    membershipFindUnique.mockResolvedValue(null);
    orgFindUnique.mockResolvedValue(null);
    sessionRows.clear();
    sessionFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => sessionRows.get(where.id) ?? null);
    // Rows created by sign-in routes must be loadable — the tenant hook
    // re-reads the row behind a token's sid on every request.
    sessionCreate.mockImplementation(async ({ data }: {
      data: { userId: string; organizationId: string; role: string; expiresAt: Date; userAgent?: string | null; ip?: string | null };
    }) => {
      const id = `sess-created-${sessionRows.size + 1}`;
      sessionRows.set(id, {
        id,
        userId: data.userId,
        organizationId: data.organizationId,
        role: data.role,
        issuedAt: new Date(),
        expiresAt: data.expiresAt,
        lastSeenAt: new Date(),
        revokedAt: null,
        revokedReason: null,
        userAgent: data.userAgent ?? null,
        ip: data.ip ?? null,
      });
      return { id };
    });
    sessionUpdateMany.mockResolvedValue({ count: 0 });
    transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      job: { findFirst, findUnique, updateMany },
      domainEventOutbox: { create: createDomainEvent },
    }));
  });

  it("rejects a missing bearer session even when a tenant header is supplied", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/jobs",
      headers: { "x-organization-id": ORG },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects a tenant header that conflicts with the signed session", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/jobs",
      headers: {
        authorization: `Bearer ${token()}`,
        "x-organization-id": "another-org",
      },
    });
    expect(response.statusCode).toBe(403);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("returns the authenticated session claims without exposing token data", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${token()}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      authenticated: true,
      userId: "user-1",
      organizationId: ORG,
      role: "technician",
    });
    expect(response.json()).not.toHaveProperty("token");
    // A claims pair with no membership resolves both names to null, never a
    // 500 (legacy/dev sessions like the hq-operator userId land here).
    expect(response.json().name).toBeNull();
    expect(response.json().organizationName).toBeNull();
  });

  it("resolves the organization name per request so a rename propagates without re-login", async () => {
    membershipFindUnique.mockResolvedValue({
      user: { name: "Sam Field" },
      organization: { name: "Mallee Plumbing" },
    });
    const bearer = { authorization: `Bearer ${token()}` };
    const first = await app.inject({ method: "GET", url: "/api/auth/session", headers: bearer });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ name: "Sam Field", organizationName: "Mallee Plumbing" });

    // Same token, org renamed underneath — the next read sees the new name.
    membershipFindUnique.mockResolvedValue({
      user: { name: "Sam Field" },
      organization: { name: "Mallee Waterworks" },
    });
    const second = await app.inject({ method: "GET", url: "/api/auth/session", headers: bearer });
    expect(second.json().organizationName).toBe("Mallee Waterworks");
  });

  it("blocks a technician from changing job metadata (field writes only)", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/jobs/J-1",
      headers: { authorization: `Bearer ${token("technician")}` },
      payload: { client: "Someone Else" },
    });
    expect(response.statusCode).toBe(403);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("allows a technician to complete/sign a job (field sign-off)", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/jobs/J-1",
      headers: { authorization: `Bearer ${token("technician")}` },
      payload: { status: "completed", signature: "data:image/png;base64,abc" },
    });
    expect(response.statusCode).toBe(200);
  });

  it("allows a manager to change only a job in their organization", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/jobs/J-1",
      headers: { authorization: `Bearer ${token("manager")}` },
      payload: { status: "completed" },
    });
    expect(response.statusCode).toBe(200);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "J-1", orgId: ORG },
      data: { status: "completed" },
    });
  });
});

describe("retired device enrollment", () => {
  const previousLegacySetting = process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER;
  const previousAuthSecret = process.env.AUTH_SECRET;
  const previousBootstrap = process.env.DEVICE_BOOTSTRAP_TOKEN;
  const previousDeviceOrg = process.env.DEVICE_ORG_ID;

  afterAll(() => {
    const restore = (key: string, previous: string | undefined) => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    };
    restore("PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER", previousLegacySetting);
    restore("AUTH_SECRET", previousAuthSecret);
    restore("DEVICE_BOOTSTRAP_TOKEN", previousBootstrap);
    restore("DEVICE_ORG_ID", previousDeviceOrg);
  });

  it("answers 410 in a dev/test app — the legacy-header enrollment path is gone too", async () => {
    process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER = "true";
    process.env.AUTH_SECRET = "test-auth-secret";
    delete process.env.DEVICE_BOOTSTRAP_TOKEN;
    const devApp = await buildApp({ logger: false });
    await devApp.ready();
    try {
      const response = await devApp.inject({
        method: "POST",
        url: "/api/auth/device",
        headers: { "x-organization-id": ORG },
        payload: { deviceId: "van-1" },
      });
      expect(response.statusCode).toBe(410);
      expect(response.json()).toMatchObject({ error: "Gone" });
      expect(response.json().message).toMatch(/retired/);
    } finally {
      await devApp.close();
    }
  });

  it("answers 410 in a production-configured app", async () => {
    process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER = "false";
    process.env.AUTH_SECRET = "test-auth-secret";
    delete process.env.DEVICE_BOOTSTRAP_TOKEN;
    const prodApp = await buildApp({ logger: false });
    await prodApp.ready();
    try {
      const response = await prodApp.inject({
        method: "POST",
        url: "/api/auth/device",
        headers: { "x-organization-id": ORG },
        payload: { deviceId: "van-1" },
      });
      expect(response.statusCode).toBe(410);
      expect(response.json().message).toMatch(/retired/);
    } finally {
      await prodApp.close();
    }
  });

  it("renews and clears an HTTP-only session cookie", async () => {
    process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER = "true"
    process.env.AUTH_SECRET = "test-auth-secret"
    const devApp = await buildApp({ logger: false })
    await devApp.ready()
    try {
      const enrolled = await devApp.inject({ method: "POST", url: "/api/auth/hq-session", headers: { "x-organization-id": ORG } })
      const cookie = enrolled.headers["set-cookie"]
      expect(cookie).toContain("plumbtrack_hq_session=")
      const renewed = await devApp.inject({ method: "POST", url: "/api/auth/renew", headers: { cookie } })
      expect(renewed.statusCode).toBe(200)
      expect(renewed.headers["set-cookie"]).toContain("HttpOnly")
      const signedOut = await devApp.inject({ method: "POST", url: "/api/auth/sign-out", headers: { cookie } })
      expect(signedOut.statusCode).toBe(204)
      expect(signedOut.headers["set-cookie"]).toContain("Max-Age=0")
    } finally { await devApp.close() }
  })

  it("answers 410 even when the retired bootstrap secret is presented", async () => {
    process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER = "false";
    process.env.AUTH_SECRET = "test-auth-secret";
    process.env.DEVICE_BOOTSTRAP_TOKEN = "the-real-secret";
    process.env.DEVICE_ORG_ID = ORG;
    const prodApp = await buildApp({ logger: false });
    await prodApp.ready();
    try {
      const response = await prodApp.inject({
        method: "POST",
        url: "/api/auth/device",
        headers: { authorization: "Bearer the-real-secret" },
        payload: { deviceId: "van-1" },
      });
      expect(response.statusCode).toBe(410);
      // No session is minted on the retired path — no cookie, no token.
      expect(response.cookies.find(c => c.name === "plumbtrack_hq_session")).toBeUndefined();
      expect(response.json()).not.toHaveProperty("token");
    } finally {
      await prodApp.close();
    }
  });

  it("answers 410 to an unauthenticated caller even with device env vars set", async () => {
    process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER = "false";
    process.env.AUTH_SECRET = "test-auth-secret";
    process.env.DEVICE_BOOTSTRAP_TOKEN = "the-real-secret";
    process.env.DEVICE_ORG_ID = ORG;
    const prodApp = await buildApp({ logger: false });
    await prodApp.ready();
    try {
      const response = await prodApp.inject({
        method: "POST",
        url: "/api/auth/device",
        payload: { deviceId: "van-1" },
      });
      expect(response.statusCode).toBe(410);
    } finally {
      await prodApp.close();
    }
  });

  it("answers 410 regardless of device env config — the vars are dead config, not guards", async () => {
    process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER = "false";
    process.env.AUTH_SECRET = "test-auth-secret";
    delete process.env.DEVICE_BOOTSTRAP_TOKEN;
    delete process.env.DEVICE_ORG_ID;
    const prodApp = await buildApp({ logger: false });
    await prodApp.ready();
    try {
      const response = await prodApp.inject({
        method: "POST",
        url: "/api/auth/device",
        headers: { authorization: "Bearer the-real-secret" },
        payload: { deviceId: "van-1" },
      });
      expect(response.statusCode).toBe(410);
    } finally {
      await prodApp.close();
    }
  });
});
