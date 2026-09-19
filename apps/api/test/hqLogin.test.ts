import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const { auditCreate, sessionCreate, sessionFindUnique, sessionFindMany, sessionUpdateMany } = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  sessionCreate: vi.fn(),
  sessionFindUnique: vi.fn(),
  sessionFindMany: vi.fn(),
  sessionUpdateMany: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    auditEvent: { create: auditCreate },
    session: {
      create: sessionCreate,
      findUnique: sessionFindUnique,
      findMany: sessionFindMany,
      updateMany: sessionUpdateMany,
    },
  },
}));

import { buildApp } from "../src/server";

const ORG = "org_hq_login";

/** In-memory sessions table — the tenant hook re-reads the row behind a
 *  token's `sid` on every request, so created rows must be loadable. */
const sessionRows = new Map<string, {
  id: string; userId: string; organizationId: string; role: string;
  issuedAt: Date; expiresAt: Date; lastSeenAt: Date;
  revokedAt: Date | null; revokedReason: string | null;
  userAgent: string | null; ip: string | null;
}>();
let sessionSeq = 0;

function seedSessionMocks(): void {
  sessionRows.clear();
  sessionSeq = 0;
  sessionCreate.mockImplementation(async ({ data }: {
    data: { userId: string; organizationId: string; role: string; expiresAt: Date; userAgent?: string | null; ip?: string | null };
  }) => {
    const id = `sess-hq-${++sessionSeq}`;
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
  sessionFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => sessionRows.get(where.id) ?? null);
  sessionFindMany.mockImplementation(async ({ where }: { where: { userId: string; organizationId: string } }) =>
    [...sessionRows.values()].filter(
      row => row.userId === where.userId && row.organizationId === where.organizationId && !row.revokedAt && row.expiresAt > new Date()
    )
  );
  sessionUpdateMany.mockImplementation(async ({ where, data }: {
    where: { id?: string; revokedAt?: null };
    data: { revokedAt?: Date; revokedReason?: string; lastSeenAt?: Date; expiresAt?: Date };
  }) => {
    let count = 0;
    for (const row of sessionRows.values()) {
      if (where.id && row.id !== where.id) continue;
      if (where.revokedAt === null && row.revokedAt) continue;
      Object.assign(row, data);
      count += 1;
    }
    return { count };
  });
}

function decodeTokenClaims(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8")) as Record<string, unknown>;
}

describe("POST /api/auth/hq-session", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Simulate a production configuration: legacy tenant header disabled,
    // signed sessions required, station bootstrap secret configured.
    process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER = "false";
    process.env.AUTH_SECRET = "test-signing-secret";
    process.env.HQ_BOOTSTRAP_TOKEN = "station-bootstrap-token";
    process.env.HQ_ORG_ID = ORG;
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER;
    delete process.env.AUTH_SECRET;
    delete process.env.HQ_BOOTSTRAP_TOKEN;
    delete process.env.HQ_ORG_ID;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    auditCreate.mockResolvedValue({});
    seedSessionMocks();
  });

  it("refuses in production mode — the shared station token is retired", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/hq-session",
      headers: { authorization: "Bearer station-bootstrap-token" },
    });

    expect(response.statusCode).toBe(410);
    expect(response.json().message).toMatch(/retired/);
    // No session minted, nothing audited as a sign-in.
    expect(response.cookies.find(c => c.name === "plumbtrack_hq_session")).toBeUndefined();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("refuses identically with no token — no probing surface", async () => {
    const response = await app.inject({ method: "POST", url: "/api/auth/hq-session" });
    expect(response.statusCode).toBe(410);
  });

  it("dev fallback: legacy org header still signs in as owner when the fallback is allowed", async () => {
    delete process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER;
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/hq-session",
        headers: { "x-organization-id": ORG },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().role).toBe("owner");
      expect(response.json().organizationId).toBe(ORG);
      expect(auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ orgId: ORG, action: "auth.hq_sign_in" }),
        })
      );
    } finally {
      process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER = "false";
    }
  });

  it("dev fallback: mints a sid-bound session row — listed by /sessions and revocable by /sign-out", async () => {
    delete process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER;
    try {
      const enrolled = await app.inject({
        method: "POST",
        url: "/api/auth/hq-session",
        headers: { "x-organization-id": ORG },
      });
      expect(enrolled.statusCode).toBe(201);

      // A real sessions row backs the token — the same row /api/auth/login creates.
      expect(sessionCreate).toHaveBeenCalledTimes(1);
      const claims = decodeTokenClaims(enrolled.json().token);
      expect(typeof claims.sid).toBe("string");
      const sessionId = claims.sid as string;
      expect(sessionRows.get(sessionId)).toMatchObject({
        userId: "hq-operator",
        organizationId: ORG,
        role: "owner",
        revokedAt: null,
      });

      const bearer = { authorization: `Bearer ${enrolled.json().token}` };

      // The session is visible in the caller's own device list — marked current.
      const sessions = await app.inject({ method: "GET", url: "/api/auth/sessions", headers: bearer });
      expect(sessions.statusCode).toBe(200);
      expect(sessions.json().sessions).toHaveLength(1);
      expect(sessions.json().sessions[0]).toMatchObject({ id: sessionId, current: true });

      // Sign-out revokes the row — the same token is dead immediately after.
      const signedOut = await app.inject({ method: "POST", url: "/api/auth/sign-out", headers: bearer });
      expect(signedOut.statusCode).toBe(204);
      expect(sessionRows.get(sessionId)?.revokedAt).not.toBeNull();
      expect(sessionRows.get(sessionId)?.revokedReason).toBe("sign_out");

      const afterRevoke = await app.inject({ method: "GET", url: "/api/auth/session", headers: bearer });
      expect(afterRevoke.statusCode).toBe(401);
    } finally {
      process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER = "false";
    }
  });
});
