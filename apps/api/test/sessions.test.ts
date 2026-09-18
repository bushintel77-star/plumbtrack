import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * Revocable sessions — the sessions row behind a token's `sid` is re-read on
 * every request (no cache), so revocation, expiry and identity drift all
 * take effect immediately. This suite rehearses the production path: legacy
 * fallback off, so sid-less tokens must 401 too.
 */

const {
  userFindUnique,
  userUpdate,
  membershipFindUnique,
  orgFindUnique,
  sessionCreate,
  sessionFindUnique,
  sessionUpdateMany,
  auditCreate,
} = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  membershipFindUnique: vi.fn(),
  orgFindUnique: vi.fn(),
  sessionCreate: vi.fn(),
  sessionFindUnique: vi.fn(),
  sessionUpdateMany: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    user: { findUnique: userFindUnique, update: userUpdate },
    organization: { findUnique: orgFindUnique },
    organizationMembership: { findUnique: membershipFindUnique },
    session: {
      create: sessionCreate,
      findUnique: sessionFindUnique,
      updateMany: sessionUpdateMany,
    },
    auditEvent: { create: auditCreate },
  },
}));

import argon2 from "argon2";
import { buildApp } from "../src/server";
import { issueAuthToken, verifyAuthToken, type OrganizationRole } from "../src/lib/auth";
import { revokeSession, revokeUserSessions } from "../src/lib/sessions";

const ORG = "org-sessions";

type SessionRow = {
  id: string;
  userId: string;
  organizationId: string;
  role: string;
  issuedAt: Date;
  expiresAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
  userAgent: string | null;
  ip: string | null;
};

const sessionRows = new Map<string, SessionRow>();
let sessionSeq = 0;

function addSessionRow(overrides: Partial<SessionRow> & { role: string }): SessionRow {
  const row: SessionRow = {
    id: `sess-${++sessionSeq}`,
    userId: "user-1",
    organizationId: ORG,
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 3600_000),
    lastSeenAt: new Date(),
    revokedAt: null,
    revokedReason: null,
    userAgent: null,
    ip: null,
    ...overrides,
  };
  sessionRows.set(row.id, row);
  return row;
}

function bearerFor(row: SessionRow, claimOverrides: Partial<{ userId: string; organizationId: string; role: OrganizationRole }> = {}): string {
  return `Bearer ${issueAuthToken({
    userId: claimOverrides.userId ?? row.userId,
    organizationId: claimOverrides.organizationId ?? row.organizationId,
    role: (claimOverrides.role ?? row.role) as OrganizationRole,
    sessionId: row.id,
  })}`;
}

describe("revocable sessions", () => {
  let app: FastifyInstance;
  const prev = { ...process.env };
  const password = "a very secret passphrase";
  let hash: string;

  beforeAll(async () => {
    hash = await argon2.hash(password);
    process.env.AUTH_SECRET = "test-auth-secret";
    // Production rehearsal: no legacy fallback, so a bearer without a live
    // session row must fail closed.
    delete process.env.NODE_ENV;
    delete process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER;
    process.env.AUTH_RATE_LIMIT_MAX = "100";
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    for (const key of ["AUTH_SECRET", "NODE_ENV", "PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER", "AUTH_RATE_LIMIT_MAX"]) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    sessionRows.clear();
    userUpdate.mockResolvedValue({});
    membershipFindUnique.mockResolvedValue(null);
    orgFindUnique.mockResolvedValue({ name: "Mallee Plumbing" });
    auditCreate.mockResolvedValue({ id: "audit-1" });
    sessionCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      const row = addSessionRow(data as Partial<SessionRow> & { role: string });
      return { id: row.id };
    });
    sessionFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => sessionRows.get(where.id) ?? null);
    sessionUpdateMany.mockImplementation(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      let count = 0;
      for (const row of sessionRows.values()) {
        if (where.id !== undefined && row.id !== where.id) continue;
        if (where.userId !== undefined && row.userId !== where.userId) continue;
        if (where.organizationId !== undefined && row.organizationId !== where.organizationId) continue;
        if (where.revokedAt === null && row.revokedAt !== null) continue;
        const floor = where.lastSeenAt as { lt?: Date } | undefined;
        if (floor?.lt && row.lastSeenAt >= floor.lt) continue;
        Object.assign(row, data);
        count++;
      }
      return { count };
    });
  });

  async function login(role: OrganizationRole = "technician") {
    userFindUnique.mockResolvedValue({
      id: "user-1",
      name: "Dave Roper",
      passwordHash: hash,
      failedLoginCount: 0,
      lockedUntil: null,
      memberships: [{ organizationId: ORG, role }],
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "dave@mallee.example", password },
    });
    expect(response.statusCode).toBe(200);
    return response.json().token as string;
  }

  it("login creates a session row and the token authenticates a request", async () => {
    const token = await login();
    expect(sessionCreate).toHaveBeenCalledTimes(1);
    const sid = verifyAuthToken(token)?.sid;
    expect(sid).toBeTruthy();
    expect(sessionRows.has(sid as string)).toBe(true);

    const probe = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(probe.statusCode).toBe(200);
    expect(probe.json()).toMatchObject({ authenticated: true, userId: "user-1", role: "technician" });
  });

  it("a revoked session row 401s a still-signature-valid token", async () => {
    const token = await login();
    const sid = verifyAuthToken(token)!.sid as string;
    await revokeSession(sid, "member_removed");
    expect(sessionRows.get(sid)?.revokedAt).not.toBeNull();

    const probe = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(probe.statusCode).toBe(401);
  });

  it("/sign-out revokes the session; the same token then 401s", async () => {
    const token = await login();
    const sid = verifyAuthToken(token)!.sid as string;

    const signOut = await app.inject({
      method: "POST",
      url: "/api/auth/sign-out",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(signOut.statusCode).toBe(204);
    expect(sessionRows.get(sid)?.revokedAt).not.toBeNull();
    expect(sessionRows.get(sid)?.revokedReason).toBe("sign_out");

    const probe = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(probe.statusCode).toBe(401);
  });

  it("/renew reuses the same sid, extends expiresAt and creates no second row", async () => {
    const token = await login("dispatcher");
    const sid = verifyAuthToken(token)!.sid as string;
    // Shrink the row's expiry first so renewal demonstrably extends it.
    sessionRows.get(sid)!.expiresAt = new Date(Date.now() + 60_000);
    const before = sessionRows.get(sid)!.expiresAt.getTime();

    const renewed = await app.inject({
      method: "POST",
      url: "/api/auth/renew",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(renewed.statusCode).toBe(200);
    // Renew returns the re-minted session in the cookie, not the body.
    const cookie = [renewed.headers["set-cookie"]].flat().join(";").match(/plumbtrack_hq_session=([^;]+)/)?.[1];
    expect(cookie).toBeTruthy();
    expect(verifyAuthToken(cookie as string)?.sid).toBe(sid);
    expect(sessionRows.get(sid)!.expiresAt.getTime()).toBeGreaterThan(before);
    expect(sessionCreate).toHaveBeenCalledTimes(1); // login only
    expect(sessionRows.size).toBe(1);
  });

  it("an expired session row 401s even though the token itself has not", async () => {
    const token = await login();
    const sid = verifyAuthToken(token)!.sid as string;
    sessionRows.get(sid)!.expiresAt = new Date(Date.now() - 1000);

    const probe = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(probe.statusCode).toBe(401);
  });

  it("a sid-less token 401s with the legacy fallback disabled", async () => {
    const legacy = issueAuthToken({ userId: "user-1", organizationId: ORG, role: "technician" });
    const probe = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${legacy}` },
    });
    expect(probe.statusCode).toBe(401);
  });

  it("a session row disagreeing with the claims on user or org 401s", async () => {
    // Row belongs to a different user than the token claims.
    const wrongUser = addSessionRow({ role: "technician", userId: "someone-else" });
    const probeUser = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: bearerFor(wrongUser, { userId: "user-1" }) },
    });
    expect(probeUser.statusCode).toBe(401);

    // Row lives in another org than the token claims.
    const wrongOrg = addSessionRow({ role: "technician", organizationId: "org-elsewhere" });
    const probeOrg = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: bearerFor(wrongOrg, { organizationId: ORG }) },
    });
    expect(probeOrg.statusCode).toBe(401);
  });

  it("the session row's role wins over the token's role", async () => {
    const row = addSessionRow({ role: "dispatcher" });
    // Token claims owner; the row says dispatcher — dispatcher must win.
    const probe = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: bearerFor(row, { role: "owner" }) },
    });
    expect(probe.statusCode).toBe(200);
    expect(probe.json().role).toBe("dispatcher");
  });

  it("revokeUserSessions revokes every row for that user in that org only", async () => {
    addSessionRow({ id: "s-a", role: "technician" });
    addSessionRow({ id: "s-b", role: "dispatcher" });
    addSessionRow({ id: "s-other-org", role: "technician", organizationId: "org-elsewhere" });
    addSessionRow({ id: "s-other-user", role: "technician", userId: "user-2" });
    addSessionRow({ id: "s-gone", role: "technician", revokedAt: new Date(), revokedReason: "sign_out" });

    const count = await revokeUserSessions("user-1", ORG, "member_removed");
    expect(count).toBe(2);
    expect(sessionRows.get("s-a")?.revokedReason).toBe("member_removed");
    expect(sessionRows.get("s-b")?.revokedReason).toBe("member_removed");
    expect(sessionRows.get("s-other-org")?.revokedAt).toBeNull();
    expect(sessionRows.get("s-other-user")?.revokedAt).toBeNull();
    // Already-revoked rows keep their first reason.
    expect(sessionRows.get("s-gone")?.revokedReason).toBe("sign_out");
  });
});

describe("stream session revocation", () => {
  let app: FastifyInstance;
  let baseUrl: string;
  const prev = { ...process.env };

  beforeAll(async () => {
    process.env.AUTH_SECRET = "test-auth-secret";
    delete process.env.NODE_ENV;
    delete process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER;
    app = await buildApp({ logger: false });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("no listen address");
    baseUrl = `ws://127.0.0.1:${address.port}/api/stream`;
  });

  afterAll(async () => {
    for (const key of ["AUTH_SECRET", "NODE_ENV", "PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER"]) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    sessionRows.clear();
    sessionFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => sessionRows.get(where.id) ?? null);
    sessionUpdateMany.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function streamToken(row: SessionRow): string {
    return issueAuthToken({
      userId: row.userId,
      organizationId: row.organizationId,
      role: row.role as OrganizationRole,
      expiresInSeconds: 900,
      sessionId: row.id,
    });
  }

  function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      socket.addEventListener("message", event => resolve(JSON.parse(String(event.data))), { once: true });
      socket.addEventListener("error", () => reject(new Error("socket error")), { once: true });
    });
  }

  function closed(socket: WebSocket): Promise<void> {
    return new Promise(resolve => socket.addEventListener("close", () => resolve(), { once: true }));
  }

  it("refuses a revoked session at connect with the unauthorized frame", async () => {
    const row = addSessionRow({ role: "dispatcher", revokedAt: new Date(), revokedReason: "member_removed" });
    const socket = new WebSocket(`${baseUrl}?token=${streamToken(row)}`);
    const closing = closed(socket);
    const frame = await nextMessage(socket);
    expect(frame).toEqual({ topic: "topic/stream/error", reason: "unauthorized" });
    await closing;
  });

  it("closes an open socket on the next heartbeat after revocation", async () => {
    // Fake only the interval the heartbeat uses — setTimeout/Date stay real
    // so the undici WebSocket handshake is unaffected. Enabled before connect
    // because the server creates the interval inside the socket handler.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const row = addSessionRow({ role: "dispatcher" });
      const socket = new WebSocket(`${baseUrl}?token=${streamToken(row)}`);
      // Frames can land during the timer advance, before a once-listener is
      // attached — queue every frame from the start instead.
      const frames: Record<string, unknown>[] = [];
      socket.addEventListener("message", event => frames.push(JSON.parse(String(event.data))));
      const closing = closed(socket);
      // Handshake + hello run on real IO; only the interval is faked.
      while (frames.length === 0) await new Promise(r => setTimeout(r, 5));
      expect(frames[0]).toMatchObject({ topic: "topic/stream/hello", orgId: ORG });

      sessionRows.get(row.id)!.revokedAt = new Date();
      await vi.advanceTimersByTimeAsync(30_000);
      await closing;
      expect(frames).toContainEqual({ topic: "topic/stream/error", reason: "revoked" });
    } finally {
      vi.useRealTimers();
    }
  });
});
