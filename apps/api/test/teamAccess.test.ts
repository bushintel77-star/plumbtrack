import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * Team access management — role changes, member removal, invite revocation
 * and self-service session revocation. The load-bearing invariant: the
 * SESSION row's role is authoritative at request time (tenant.ts), so a
 * role change must re-stamp every live session in the same transaction —
 * otherwise a demoted admin keeps their old powers until re-login. The
 * headline test proves the old token's effective role changes immediately.
 */

const {
  prismaMock,
  userFindUnique,
  userCreate,
  userUpdate,
  userDelete,
  membershipFindFirst,
  membershipFindUnique,
  membershipFindMany,
  membershipUpdate,
  membershipDelete,
  membershipUpsert,
  membershipCount,
  inviteFindFirst,
  inviteFindUnique,
  inviteFindMany,
  inviteCreate,
  inviteUpdateMany,
  orgFindUnique,
  sessionCreate,
  sessionFindUnique,
  sessionFindMany,
  sessionUpdateMany,
  auditCreate,
} = vi.hoisted(() => {
  const mocks = {
    userFindUnique: vi.fn(),
    userCreate: vi.fn(),
    userUpdate: vi.fn(),
    userDelete: vi.fn(),
    membershipFindFirst: vi.fn(),
    membershipFindUnique: vi.fn(),
    membershipFindMany: vi.fn(),
    membershipUpdate: vi.fn(),
    membershipDelete: vi.fn(),
    membershipUpsert: vi.fn(),
    membershipCount: vi.fn(),
    inviteFindFirst: vi.fn(),
    inviteFindUnique: vi.fn(),
    inviteFindMany: vi.fn(),
    inviteCreate: vi.fn(),
    inviteUpdateMany: vi.fn(),
    orgFindUnique: vi.fn(),
    sessionCreate: vi.fn(),
    sessionFindUnique: vi.fn(),
    sessionFindMany: vi.fn(),
    sessionUpdateMany: vi.fn(),
    auditCreate: vi.fn(),
  };
  const prismaMock = {
    user: { findUnique: mocks.userFindUnique, create: mocks.userCreate, update: mocks.userUpdate, delete: mocks.userDelete },
    organization: { findUnique: mocks.orgFindUnique },
    organizationMembership: {
      findFirst: mocks.membershipFindFirst,
      findUnique: mocks.membershipFindUnique,
      findMany: mocks.membershipFindMany,
      update: mocks.membershipUpdate,
      delete: mocks.membershipDelete,
      upsert: mocks.membershipUpsert,
      count: mocks.membershipCount,
    },
    teamInvite: {
      findFirst: mocks.inviteFindFirst,
      findUnique: mocks.inviteFindUnique,
      findMany: mocks.inviteFindMany,
      create: mocks.inviteCreate,
      updateMany: mocks.inviteUpdateMany,
    },
    session: {
      create: mocks.sessionCreate,
      findUnique: mocks.sessionFindUnique,
      findMany: mocks.sessionFindMany,
      updateMany: mocks.sessionUpdateMany,
    },
    auditEvent: { create: mocks.auditCreate },
    // Transactions run against the same mock surface — the routes' tx
    // writes land on the in-memory stores exactly like direct calls.
    $transaction: (fn: (tx: unknown) => unknown) => fn(prismaMock),
  };
  return { prismaMock, ...mocks };
});

vi.mock("@plumbtrack/database", () => ({ prisma: prismaMock }));

import argon2 from "argon2";
import { buildApp } from "../src/server";
import { issueAuthToken, type OrganizationRole } from "../src/lib/auth";

const ORG = "org-access";
const OTHER_ORG = "org-elsewhere";

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

type MemberRow = {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  skills: string[];
  createdAt: Date;
  user: { name: string; email: string };
};

type InviteRow = {
  id: string;
  orgId: string;
  email: string;
  name: string | null;
  role: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
};

const sessionRows = new Map<string, SessionRow>();
const memberRows = new Map<string, MemberRow>();
const inviteRows = new Map<string, InviteRow>();
let sessionSeq = 0;

const memberKey = (orgId: string, userId: string) => `${orgId}|${userId}`;

function addSession(overrides: Partial<SessionRow> & { userId: string; role: string }): SessionRow {
  const row: SessionRow = {
    id: `sess-${++sessionSeq}`,
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

function bearer(row: SessionRow): string {
  return `Bearer ${issueAuthToken({
    userId: row.userId,
    organizationId: row.organizationId,
    role: row.role as OrganizationRole,
    sessionId: row.id,
  })}`;
}

function addMember(overrides: Partial<MemberRow> & { userId: string; role: string }): MemberRow {
  const row: MemberRow = {
    id: `m-${overrides.userId}`,
    organizationId: ORG,
    skills: [],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    user: { name: overrides.userId, email: `${overrides.userId}@mallee.example` },
    ...overrides,
  };
  memberRows.set(memberKey(row.organizationId, row.userId), row);
  return row;
}

function addInvite(overrides: Partial<InviteRow> & { id: string }): InviteRow {
  const row: InviteRow = {
    orgId: ORG,
    email: "invitee@mallee.example",
    name: null,
    role: "technician",
    tokenHash: "hash-unused",
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 3600_000),
    acceptedAt: null,
    revokedAt: null,
    ...overrides,
  };
  inviteRows.set(row.id, row);
  return row;
}

describe("team access management", () => {
  let app: FastifyInstance;
  const prev = { ...process.env };
  const password = "a very secret passphrase";
  let hash: string;

  beforeAll(async () => {
    hash = await argon2.hash(password);
    process.env.AUTH_SECRET = "test-auth-secret";
    delete process.env.NODE_ENV;
    delete process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER;
    process.env.AUTH_RATE_LIMIT_MAX = "1000";
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
    memberRows.clear();
    inviteRows.clear();
    auditCreate.mockResolvedValue({ id: "audit-1" });
    orgFindUnique.mockResolvedValue({ name: "Mallee Plumbing" });
    userUpdate.mockResolvedValue({});
    membershipFindFirst.mockResolvedValue(null);
    membershipFindMany.mockResolvedValue([]);

    sessionCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      const row = addSession(data as Partial<SessionRow> & { userId: string; role: string });
      return { id: row.id };
    });
    sessionFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => sessionRows.get(where.id) ?? null);
    sessionFindMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      const rows = [...sessionRows.values()].filter(row => {
        if (where.userId !== undefined && row.userId !== where.userId) return false;
        if (where.organizationId !== undefined && row.organizationId !== where.organizationId) return false;
        if (where.revokedAt === null && row.revokedAt !== null) return false;
        const expiry = where.expiresAt as { gt?: Date } | undefined;
        if (expiry?.gt && row.expiresAt <= expiry.gt) return false;
        return true;
      });
      return rows.sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
    });
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

    membershipFindUnique.mockImplementation(async ({ where }: { where: { organizationId_userId: { organizationId: string; userId: string } } }) => {
      const row = memberRows.get(memberKey(where.organizationId_userId.organizationId, where.organizationId_userId.userId));
      // /api/auth/session selects organization.name through the same lookup.
      return row ? { ...row, organization: { name: "Mallee Plumbing" } } : null;
    });
    membershipUpdate.mockImplementation(async ({ where, data }: { where: { organizationId_userId: { organizationId: string; userId: string } }; data: Record<string, unknown> }) => {
      const row = memberRows.get(memberKey(where.organizationId_userId.organizationId, where.organizationId_userId.userId));
      if (!row) throw new Error("membership not found");
      Object.assign(row, data);
      return row;
    });
    membershipDelete.mockImplementation(async ({ where }: { where: { organizationId_userId: { organizationId: string; userId: string } } }) => {
      const key = memberKey(where.organizationId_userId.organizationId, where.organizationId_userId.userId);
      const row = memberRows.get(key);
      memberRows.delete(key);
      return row;
    });
    membershipCount.mockImplementation(async ({ where }: { where: { organizationId: string; role: string } }) =>
      [...memberRows.values()].filter(row => row.organizationId === where.organizationId && row.role === where.role).length,
    );
    membershipUpsert.mockResolvedValue({});

    inviteFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      for (const row of inviteRows.values()) {
        if (where.id !== undefined && row.id !== where.id) continue;
        if (where.orgId !== undefined && row.orgId !== where.orgId) continue;
        if (where.email !== undefined && row.email !== where.email) continue;
        if (where.acceptedAt === null && row.acceptedAt !== null) continue;
        if (where.revokedAt === null && row.revokedAt !== null) continue;
        const expiry = where.expiresAt as { gt?: Date } | undefined;
        if (expiry?.gt && row.expiresAt <= expiry.gt) continue;
        return row;
      }
      return null;
    });
    inviteFindUnique.mockImplementation(async ({ where }: { where: { tokenHash: string } }) =>
      [...inviteRows.values()].find(row => row.tokenHash === where.tokenHash) ?? null,
    );
    inviteFindMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      [...inviteRows.values()].filter(row => {
        if (row.orgId !== where.orgId) return false;
        if (where.acceptedAt === null && row.acceptedAt !== null) return false;
        if (where.revokedAt === null && row.revokedAt !== null) return false;
        const expiry = where.expiresAt as { gt?: Date } | undefined;
        if (expiry?.gt && row.expiresAt <= expiry.gt) return false;
        return true;
      }),
    );
    inviteCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      const row = addInvite({ ...(data as Partial<InviteRow>), id: `inv-${inviteRows.size + 1}` });
      return row;
    });
    inviteUpdateMany.mockImplementation(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      let count = 0;
      for (const row of inviteRows.values()) {
        if (where.id !== undefined && row.id !== where.id) continue;
        if (where.orgId !== undefined && row.orgId !== where.orgId) continue;
        if (where.acceptedAt === null && row.acceptedAt !== null) continue;
        if (where.revokedAt === null && row.revokedAt !== null) continue;
        const expiry = where.expiresAt as { gt?: Date } | undefined;
        if (expiry?.gt && row.expiresAt <= expiry.gt) continue;
        Object.assign(row, data);
        count++;
      }
      return { count };
    });
  });

  function callerSession(role: OrganizationRole, userId = "user-caller", org = ORG): SessionRow {
    return addSession({ userId, role, organizationId: org });
  }

  async function loginAs(userId: string, role: OrganizationRole): Promise<string> {
    userFindUnique.mockResolvedValue({
      id: userId,
      name: userId,
      passwordHash: hash,
      failedLoginCount: 0,
      lockedUntil: null,
      memberships: [{ organizationId: ORG, role }],
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: `${userId}@mallee.example`, password },
    });
    expect(response.statusCode).toBe(200);
    return response.json().token as string;
  }

  describe("PATCH /api/team/members/:userId — role changes", () => {
    it("HEADLINE: an existing token's effective role changes on the next request, no re-login", async () => {
      // Dave holds a live session minted as technician.
      const token = await loginAs("user-dave", "technician");
      addMember({ userId: "user-dave", role: "technician" });
      addMember({ userId: "user-caller", role: "owner" });

      const before = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(before.json().role).toBe("technician");

      const patch = await app.inject({
        method: "PATCH",
        url: "/api/team/members/user-dave",
        headers: { authorization: bearer(callerSession("owner")) },
        payload: { role: "dispatcher" },
      });
      expect(patch.statusCode).toBe(200);
      expect(patch.json().role).toBe("dispatcher");

      // The SAME token — claims still say technician — now authenticates
      // as dispatcher because the session row moved with the membership.
      const after = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(after.statusCode).toBe(200);
      expect(after.json().role).toBe("dispatcher");
    });

    it("keeps skills-only PATCHes byte-identical — no session writes", async () => {
      addMember({ userId: "user-dave", role: "technician" });
      const response = await app.inject({
        method: "PATCH",
        url: "/api/team/members/user-dave",
        headers: { authorization: bearer(callerSession("admin")) },
        payload: { skills: [" Gas ", "gas", "drainage"] },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().skills).toEqual(["Gas", "drainage"]);
      // Only touchSession may have written session rows — never a role stamp.
      const roleWrites = sessionUpdateMany.mock.calls.filter(
        call => (call[0] as { data: Record<string, unknown> }).data.role !== undefined,
      );
      expect(roleWrites).toHaveLength(0);
    });

    it("rejects a body with neither skills nor role", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/api/team/members/user-dave",
        headers: { authorization: bearer(callerSession("admin")) },
        payload: {},
      });
      expect(response.statusCode).toBe(400);
    });

    it("an admin cannot grant owner or demote an owner — 403 both ways", async () => {
      addMember({ userId: "user-dave", role: "technician" });
      const promote = await app.inject({
        method: "PATCH",
        url: "/api/team/members/user-dave",
        headers: { authorization: bearer(callerSession("admin")) },
        payload: { role: "owner" },
      });
      expect(promote.statusCode).toBe(403);

      addMember({ userId: "user-owner", role: "owner" });
      const demote = await app.inject({
        method: "PATCH",
        url: "/api/team/members/user-owner",
        headers: { authorization: bearer(callerSession("admin")) },
        payload: { role: "dispatcher" },
      });
      expect(demote.statusCode).toBe(403);
    });

    it("refuses a self role change — blocks admin self-promotion", async () => {
      addMember({ userId: "user-caller", role: "admin" });
      const response = await app.inject({
        method: "PATCH",
        url: "/api/team/members/user-caller",
        headers: { authorization: bearer(callerSession("admin")) },
        payload: { role: "owner" },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().message).toBe("You can't change your own role — ask another owner.");
    });

    it("refuses to demote the last owner — 409", async () => {
      addMember({ userId: "user-owner", role: "owner" });
      addMember({ userId: "user-caller", role: "owner" });
      // Caller is a different owner... but the target IS the only other owner
      // and there are two — reduce to one by removing the caller's row.
      memberRows.delete(memberKey(ORG, "user-caller"));
      const response = await app.inject({
        method: "PATCH",
        url: "/api/team/members/user-owner",
        headers: { authorization: bearer(callerSession("owner")) },
        payload: { role: "dispatcher" },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().message).toBe("Your organisation needs at least one owner.");
    });
  });

  describe("DELETE /api/team/members/:userId", () => {
    it("removes the membership and revokes only that user's sessions in that org", async () => {
      addMember({ userId: "user-dave", role: "technician" });
      const s1 = addSession({ userId: "user-dave", role: "technician" });
      const s2 = addSession({ userId: "user-dave", role: "technician" });
      const otherOrg = addSession({ userId: "user-dave", role: "technician", organizationId: OTHER_ORG });
      const otherUser = addSession({ userId: "user-other", role: "technician" });

      const response = await app.inject({
        method: "DELETE",
        url: "/api/team/members/user-dave",
        headers: { authorization: bearer(callerSession("admin")) },
      });
      expect(response.statusCode).toBe(204);
      expect(memberRows.has(memberKey(ORG, "user-dave"))).toBe(false);
      expect(sessionRows.get(s1.id)?.revokedReason).toBe("member_removed");
      expect(sessionRows.get(s2.id)?.revokedAt).not.toBeNull();
      expect(sessionRows.get(otherOrg.id)?.revokedAt).toBeNull();
      expect(sessionRows.get(otherUser.id)?.revokedAt).toBeNull();
      // The User row is global — never touched.
      expect(userDelete).not.toHaveBeenCalled();
    });

    it("refuses to remove yourself — 409", async () => {
      addMember({ userId: "user-caller", role: "owner" });
      const response = await app.inject({
        method: "DELETE",
        url: "/api/team/members/user-caller",
        headers: { authorization: bearer(callerSession("owner")) },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().message).toBe("You can't remove your own account — ask another owner.");
    });

    it("refuses to remove the last owner — 409", async () => {
      addMember({ userId: "user-owner", role: "owner" });
      addMember({ userId: "user-tech", role: "technician" });
      const response = await app.inject({
        method: "DELETE",
        url: "/api/team/members/user-owner",
        headers: { authorization: bearer(callerSession("owner")) },
      });
      expect(response.statusCode).toBe(409);
    });
  });

  describe("POST /api/team/members/:userId/sign-out", () => {
    it("revokes the member's live sessions without touching the membership", async () => {
      addMember({ userId: "user-dave", role: "technician" });
      const s1 = addSession({ userId: "user-dave", role: "technician" });
      addSession({ userId: "user-dave", role: "technician", revokedAt: new Date(), revokedReason: "sign_out" });

      const response = await app.inject({
        method: "POST",
        url: "/api/team/members/user-dave/sign-out",
        headers: { authorization: bearer(callerSession("admin")) },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().revoked).toBe(1);
      expect(sessionRows.get(s1.id)?.revokedReason).toBe("signed_out_by_admin");
      expect(memberRows.has(memberKey(ORG, "user-dave"))).toBe(true);
    });

    it("404s for a non-member; an admin cannot sign out an owner", async () => {
      const missing = await app.inject({
        method: "POST",
        url: "/api/team/members/ghost/sign-out",
        headers: { authorization: bearer(callerSession("admin")) },
      });
      expect(missing.statusCode).toBe(404);

      addMember({ userId: "user-owner", role: "owner" });
      const denied = await app.inject({
        method: "POST",
        url: "/api/team/members/user-owner/sign-out",
        headers: { authorization: bearer(callerSession("admin")) },
      });
      expect(denied.statusCode).toBe(403);
    });
  });

  describe("team invites: list + revoke", () => {
    it("GET /api/team/invites lists pending invites and never exposes tokenHash", async () => {
      addInvite({ id: "inv-1", email: "one@mallee.example", tokenHash: "SECRET-HASH-1" });
      addInvite({ id: "inv-2", email: "two@mallee.example", tokenHash: "SECRET-HASH-2", revokedAt: new Date() });
      addInvite({ id: "inv-3", email: "three@mallee.example", tokenHash: "SECRET-HASH-3", acceptedAt: new Date() });
      addInvite({ id: "inv-4", orgId: OTHER_ORG, tokenHash: "SECRET-HASH-4" });

      const response = await app.inject({
        method: "GET",
        url: "/api/team/invites",
        headers: { authorization: bearer(callerSession("admin")) },
      });
      expect(response.statusCode).toBe(200);
      const { invites } = response.json();
      expect(invites).toHaveLength(1);
      expect(invites[0]).toMatchObject({ id: "inv-1", email: "one@mallee.example", role: "technician" });
      expect(JSON.stringify(response.body)).not.toContain("SECRET-HASH");
      expect(JSON.stringify(response.body)).not.toContain("tokenHash");
    });

    it("a dispatcher cannot list invites — it's a management surface", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/team/invites",
        headers: { authorization: bearer(callerSession("dispatcher")) },
      });
      expect(response.statusCode).toBe(403);
    });

    it("revoking a pending invite makes its accept link answer 410", async () => {
      const { createHash } = await import("node:crypto");
      const rawToken = "a".repeat(32);
      const tokenHash = createHash("sha256").update(rawToken, "utf8").digest("hex");
      addInvite({ id: "inv-live", tokenHash });

      const revoke = await app.inject({
        method: "POST",
        url: "/api/team/invites/inv-live/revoke",
        headers: { authorization: bearer(callerSession("admin")) },
      });
      expect(revoke.statusCode).toBe(204);
      expect(inviteRows.get("inv-live")?.revokedAt).not.toBeNull();

      const accept = await app.inject({
        method: "POST",
        url: `/api/invites/${rawToken}/accept`,
        payload: { name: "New Person", password: "long enough passphrase" },
      });
      expect(accept.statusCode).toBe(410);
    });

    it("another org's invite id is a 404, and an admin cannot revoke an owner invite", async () => {
      addInvite({ id: "inv-other", orgId: OTHER_ORG });
      const cross = await app.inject({
        method: "POST",
        url: "/api/team/invites/inv-other/revoke",
        headers: { authorization: bearer(callerSession("admin")) },
      });
      expect(cross.statusCode).toBe(404);
      expect(inviteRows.get("inv-other")?.revokedAt).toBeNull();

      addInvite({ id: "inv-owner", role: "owner" });
      const denied = await app.inject({
        method: "POST",
        url: "/api/team/invites/inv-owner/revoke",
        headers: { authorization: bearer(callerSession("admin")) },
      });
      expect(denied.statusCode).toBe(403);
    });
  });

  describe("own sessions: GET /api/auth/sessions + DELETE /api/auth/sessions/:id", () => {
    it("lists only the caller's live sessions and marks the current one", async () => {
      const mine = addSession({ userId: "user-dave", role: "dispatcher", userAgent: "HQ", lastSeenAt: new Date() });
      addSession({ userId: "user-dave", role: "dispatcher", userAgent: "Old laptop", lastSeenAt: new Date(Date.now() - 60_000) });
      addSession({ userId: "user-dave", role: "dispatcher", revokedAt: new Date() });
      addSession({ userId: "user-dave", role: "dispatcher", organizationId: OTHER_ORG });
      addSession({ userId: "user-other", role: "dispatcher" });

      const response = await app.inject({
        method: "GET",
        url: "/api/auth/sessions",
        headers: { authorization: bearer(mine) },
      });
      expect(response.statusCode).toBe(200);
      const { sessions } = response.json();
      expect(sessions).toHaveLength(2);
      expect(sessions[0]).toMatchObject({ id: mine.id, current: true, userAgent: "HQ" });
      expect(sessions[1]).toMatchObject({ userAgent: "Old laptop", current: false });
    });

    it("cannot revoke another user's session — 404 and the row is untouched", async () => {
      const mine = addSession({ userId: "user-dave", role: "dispatcher" });
      const theirs = addSession({ userId: "user-other", role: "dispatcher" });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/auth/sessions/${theirs.id}`,
        headers: { authorization: bearer(mine) },
      });
      expect(response.statusCode).toBe(404);
      expect(sessionRows.get(theirs.id)?.revokedAt).toBeNull();
    });

    it("revoking your own session signs that device out — the token then 401s", async () => {
      const mine = addSession({ userId: "user-dave", role: "dispatcher" });
      const response = await app.inject({
        method: "DELETE",
        url: `/api/auth/sessions/${mine.id}`,
        headers: { authorization: bearer(mine) },
      });
      expect(response.statusCode).toBe(204);
      expect(sessionRows.get(mine.id)?.revokedReason).toBe("device_revoked");

      const probe = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: { authorization: bearer(mine) },
      });
      expect(probe.statusCode).toBe(401);
    });
  });
});
