import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * Account auth routes — sign-up, login + lockout, forgot/reset, invites.
 * Prisma is mocked at the boundary (same pattern as securityHardening.test.ts);
 * argon2 runs for real so the hash/verify path is genuinely exercised.
 */

const {
  userFindUnique,
  userCreate,
  userUpdate,
  orgCreate,
  orgFindUnique,
  membershipCreate,
  membershipFindFirst,
  membershipFindUnique,
  membershipUpsert,
  orgSetupCreate,
  resetTokenCreate,
  resetTokenFindUnique,
  resetTokenUpdate,
  inviteCreate,
  inviteFindUnique,
  inviteFindFirst,
  inviteUpdateMany,
  transaction,
  auditCreate,
} = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
  userUpdate: vi.fn(),
  orgCreate: vi.fn(),
  orgFindUnique: vi.fn(),
  membershipCreate: vi.fn(),
  membershipFindFirst: vi.fn(),
  membershipFindUnique: vi.fn(),
  membershipUpsert: vi.fn(),
  orgSetupCreate: vi.fn(),
  resetTokenCreate: vi.fn(),
  resetTokenFindUnique: vi.fn(),
  resetTokenUpdate: vi.fn(),
  inviteCreate: vi.fn(),
  inviteFindUnique: vi.fn(),
  inviteFindFirst: vi.fn(),
  inviteUpdateMany: vi.fn(),
  transaction: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    user: { findUnique: userFindUnique, create: userCreate, update: userUpdate },
    organization: { create: orgCreate, findUnique: orgFindUnique },
    organizationMembership: {
      create: membershipCreate,
      findFirst: membershipFindFirst,
      findUnique: membershipFindUnique,
      upsert: membershipUpsert,
    },
    orgSetup: { create: orgSetupCreate },
    passwordResetToken: {
      create: resetTokenCreate,
      findUnique: resetTokenFindUnique,
      update: resetTokenUpdate,
    },
    teamInvite: {
      create: inviteCreate,
      findUnique: inviteFindUnique,
      findFirst: inviteFindFirst,
      updateMany: inviteUpdateMany,
    },
    auditEvent: { create: auditCreate },
    $transaction: transaction,
  },
}));

import argon2 from "argon2";
import { buildApp } from "../src/server";
import { issueAuthToken } from "../src/lib/auth";
import * as passwords from "../src/lib/passwords";

const ORG = "org-new-co";

function bearer(role: "technician" | "dispatcher" | "admin" | "owner", org = ORG): string {
  return `Bearer ${issueAuthToken({ userId: "user-1", organizationId: org, role })}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

describe("account auth", () => {
  let app: FastifyInstance;
  const prev = { ...process.env };

  beforeAll(async () => {
    process.env.AUTH_SECRET = "test-auth-secret";
    delete process.env.NODE_ENV;
    delete process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER;
    // The suite fires more than the default 10/min at the shared instance —
    // raise its limiter; the dedicated test below tunes its own instance.
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
    // Both $transaction shapes used by the routes: callback form (sign-up,
    // invite accept) and array form (reset-password).
    transaction.mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return (arg as (tx: unknown) => unknown)({
        organization: { create: orgCreate },
        user: {
          create: userCreate,
          findUnique: userFindUnique,
          update: userUpdate,
        },
        organizationMembership: { create: membershipCreate, upsert: membershipUpsert },
        orgSetup: { create: orgSetupCreate },
        teamInvite: { updateMany: inviteUpdateMany },
      });
    });
    auditCreate.mockResolvedValue({ id: "audit-1" });
    userUpdate.mockResolvedValue({});
    resetTokenCreate.mockResolvedValue({ id: "prt-1" });
    orgFindUnique.mockResolvedValue({ name: "Mallee Plumbing" });
  });

  describe("POST /api/auth/sign-up", () => {
    it("creates org + user + owner membership + setup row and signs in", async () => {
      orgCreate.mockResolvedValue({ id: ORG, name: "Mallee Plumbing" });
      userCreate.mockResolvedValue({ id: "u-owner", email: "sam@mallee.example" });
      membershipCreate.mockResolvedValue({ id: "m-1" });
      orgSetupCreate.mockResolvedValue({ id: "setup-1" });

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/sign-up",
        payload: {
          businessName: "Mallee Plumbing",
          name: "Sam Mallee",
          email: "Sam@Mallee.example",
          password: "correct horse battery staple",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.role).toBe("owner");
      expect(body.organizationId).toBe(ORG);
      expect(body.userId).toBe("u-owner");
      expect(typeof body.token).toBe("string");
      // The session cookie is set httpOnly.
      const cookie = response.cookies.find(c => c.name === "plumbtrack_hq_session");
      expect(cookie?.httpOnly).toBe(true);
      // Owner-scoped to the NEW org only.
      expect(orgCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: "Mallee Plumbing" }),
      });
      expect(membershipCreate).toHaveBeenCalledWith({
        data: { organizationId: ORG, userId: "u-owner", role: "owner" },
      });
      expect(orgSetupCreate).toHaveBeenCalledWith({ data: { orgId: ORG } });
      // Password stored hashed, never plaintext.
      const hashArg = userCreate.mock.calls[0][0].data.passwordHash as string;
      expect(hashArg).toMatch(/^\$argon2id\$/);
      expect(hashArg).not.toContain("correct horse");
    });

    it("rejects a duplicate email", async () => {
      userFindUnique.mockResolvedValue({ id: "u-existing" });
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/sign-up",
        payload: { businessName: "Mallee", name: "Sam", email: "sam@mallee.example", password: "correct horse battery staple" },
      });
      expect(response.statusCode).toBe(409);
      expect(transaction).not.toHaveBeenCalled();
    });

    it("rejects a weak password", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/sign-up",
        payload: { businessName: "Mallee", name: "Sam", email: "sam@mallee.example", password: "password1" },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().issues[0].path).toBe("password");
    });
  });

  describe("POST /api/auth/login", () => {
    const password = "a very secret passphrase";
    let hash: string;
    beforeAll(async () => {
      hash = await argon2.hash(password);
    });

    it("signs in with the member's real role and user id", async () => {
      userFindUnique.mockResolvedValue({
        id: "u-dispatcher",
        passwordHash: hash,
        failedLoginCount: 0,
        lockedUntil: null,
        memberships: [{ organizationId: ORG, role: "dispatcher" }],
      });
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "d@mallee.example", password },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.userId).toBe("u-dispatcher");
      expect(body.role).toBe("dispatcher");
      expect(body.organizationId).toBe(ORG);
      // The org's trading name travels with the session so the field app
      // never has to carry a build-time business name.
      expect(body.organizationName).toBe("Mallee Plumbing");
      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: "u-dispatcher" },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    });

    it("wrong password and unknown email fail identically", async () => {
      userFindUnique.mockResolvedValue({
        id: "u-1",
        passwordHash: hash,
        failedLoginCount: 0,
        lockedUntil: null,
        memberships: [{ organizationId: ORG, role: "owner" }],
      });
      const wrongPassword = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "d@mallee.example", password: "wrong password entirely" },
      });
      userFindUnique.mockResolvedValue(null);
      const unknownEmail = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "nobody@elsewhere.example", password: "wrong password entirely" },
      });
      expect(wrongPassword.statusCode).toBe(401);
      expect(unknownEmail.statusCode).toBe(401);
      expect(wrongPassword.json().message).toBe(unknownEmail.json().message);
    });

    it("locks the account after repeated failures and clears on success", async () => {
      let failures = 0;
      userFindUnique.mockImplementation(async () => ({
        id: "u-1",
        passwordHash: hash,
        failedLoginCount: failures,
        lockedUntil: null,
        memberships: [{ organizationId: ORG, role: "owner" }],
      }));
      userUpdate.mockImplementation(async ({ data }: { data: { failedLoginCount?: number } }) => {
        if (typeof data.failedLoginCount === "number") failures = data.failedLoginCount;
        return {};
      });

      for (let i = 0; i < 5; i++) {
        const r = await app.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: { email: "d@mallee.example", password: "wrong password entirely" },
        });
        expect(r.statusCode).toBe(401);
      }
      expect(failures).toBe(5);
      // The sixth attempt within the window is a locked-out 429, and the
      // password is never verified against the hash.
      userFindUnique.mockResolvedValue({
        id: "u-1",
        passwordHash: hash,
        failedLoginCount: 5,
        lockedUntil: new Date(Date.now() + 60_000),
        memberships: [{ organizationId: ORG, role: "owner" }],
      });
      const locked = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "d@mallee.example", password },
      });
      expect(locked.statusCode).toBe(429);
    });

    it("restarts the failure count once the lock window expires — no permanent re-lock", async () => {
      // failedLoginCount stays at the threshold after the first lockout; if
      // expiry didn't reset it, one wrong guess would re-lock forever.
      userFindUnique.mockResolvedValue({
        id: "u-1",
        passwordHash: hash,
        failedLoginCount: 5,
        lockedUntil: new Date(Date.now() - 60_000),
        memberships: [{ organizationId: ORG, role: "owner" }],
      });
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "d@mallee.example", password: "wrong password entirely" },
      });
      expect(response.statusCode).toBe(401);
      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: "u-1" },
        data: { failedLoginCount: 1, lockedUntil: null },
      });
    });

    it("clears the expired lock and counters on a correct sign-in", async () => {
      userFindUnique.mockResolvedValue({
        id: "u-1",
        passwordHash: hash,
        failedLoginCount: 5,
        lockedUntil: new Date(Date.now() - 60_000),
        memberships: [{ organizationId: ORG, role: "owner" }],
      });
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "d@mallee.example", password },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().token).toBeTruthy();
      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: "u-1" },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    });

    it("runs the same argon2 verify for unknown emails and unaccepted invites", async () => {
      // Assert on the call, not the clock — the timing parity comes from
      // verifyPassword running once per attempt either way.
      const verifySpy = vi.spyOn(passwords, "verifyPassword");

      userFindUnique.mockResolvedValue(null);
      const unknown = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "nobody@elsewhere.example", password: "wrong password entirely" },
      });
      expect(unknown.statusCode).toBe(401);
      expect(verifySpy).toHaveBeenCalled();

      verifySpy.mockClear();
      userFindUnique.mockResolvedValue({
        id: "u-invited",
        passwordHash: null,
        failedLoginCount: 0,
        lockedUntil: null,
        memberships: [{ organizationId: ORG, role: "technician" }],
      });
      const invited = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "invited@mallee.example", password: "wrong password entirely" },
      });
      expect(invited.statusCode).toBe(401);
      expect(verifySpy).toHaveBeenCalled();
      verifySpy.mockRestore();
    });

    it("mints a ~30-day session for a technician — field devices can't re-auth mid-shift", async () => {
      userFindUnique.mockResolvedValue({
        id: "u-tech",
        name: "Dave Roper",
        passwordHash: hash,
        failedLoginCount: 0,
        lockedUntil: null,
        memberships: [{ organizationId: ORG, role: "technician" }],
      });
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "dave@mallee.example", password },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000) + 29 * 24 * 60 * 60);
      // Claims, expiresAt and cookie maxAge must agree — all three.
      const setCookie = [response.headers["set-cookie"]].flat().join(";");
      expect(setCookie).toContain("Max-Age=2592000");
    });

    it("keeps an owner session at ~12 hours — the asymmetry guard", async () => {
      userFindUnique.mockResolvedValue({
        id: "u-owner",
        name: "Sam Mallee",
        passwordHash: hash,
        failedLoginCount: 0,
        lockedUntil: null,
        memberships: [{ organizationId: ORG, role: "owner" }],
      });
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "sam@mallee.example", password },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      // This fails if someone makes every session 30 days.
      expect(body.expiresAt).toBeLessThan(Math.floor(Date.now() / 1000) + 13 * 60 * 60);
      const setCookie = [response.headers["set-cookie"]].flat().join(";");
      expect(setCookie).toContain("Max-Age=43200");
    });

    it("returns the signed-in user's real name", async () => {
      userFindUnique.mockResolvedValue({
        id: "u-tech",
        name: "Dave Roper",
        passwordHash: hash,
        failedLoginCount: 0,
        lockedUntil: null,
        memberships: [{ organizationId: ORG, role: "technician" }],
      });
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "dave@mallee.example", password },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().name).toBe("Dave Roper");
    });
  });

  describe("GET /api/auth/session", () => {
    it("returns the signed-in user's name and the org name resolved per request", async () => {
      membershipFindUnique.mockResolvedValue({
        user: { name: "Dave Roper" },
        organization: { name: "Mallee Plumbing" },
      });
      const response = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: { authorization: bearer("technician") },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        authenticated: true,
        userId: "user-1",
        role: "technician",
        name: "Dave Roper",
        organizationName: "Mallee Plumbing",
      });
      // One membership-join read resolves both names — never baked into the
      // signed claims.
      expect(membershipFindUnique).toHaveBeenCalledWith({
        where: { organizationId_userId: { organizationId: ORG, userId: "user-1" } },
        select: { user: { select: { name: true } }, organization: { select: { name: true } } },
      });
    });

    it("returns null names for claims with no membership row", async () => {
      membershipFindUnique.mockResolvedValue(null);
      const response = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: { authorization: bearer("owner") },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().name).toBeNull();
      expect(response.json().organizationName).toBeNull();
    });
  });

  describe("forgot/reset password", () => {
    it("responds identically whether or not the email exists", async () => {
      userFindUnique.mockResolvedValue(null);
      const missing = await app.inject({
        method: "POST",
        url: "/api/auth/forgot-password",
        payload: { email: "ghost@example.com" },
      });
      userFindUnique.mockResolvedValue({ id: "u-1" });
      resetTokenCreate.mockResolvedValue({ id: "prt-1" });
      const present = await app.inject({
        method: "POST",
        url: "/api/auth/forgot-password",
        payload: { email: "real@example.com" },
      });
      expect(missing.statusCode).toBe(202);
      expect(present.statusCode).toBe(202);
      // Same shape both ways — only the deployment's delivery capability
      // differs, which says nothing about account existence.
      expect(Object.keys(missing.json()).sort()).toEqual(Object.keys(present.json()).sort());
      // No email provider configured in this environment → honest flag.
      expect(present.json().delivery).toBe("unconfigured");
    });

    it("fails identically for known and unknown emails when HQ_APP_URL is missing in production", async () => {
      // The 2026-09-09 deploy drift silently dropped HQ_APP_URL; a 500 that
      // only registered emails can reach is itself an enumeration oracle.
      const previousNodeEnv = process.env.NODE_ENV;
      const previousHqUrl = process.env.HQ_APP_URL;
      process.env.NODE_ENV = "production";
      delete process.env.HQ_APP_URL;
      try {
        userFindUnique.mockResolvedValue({ id: "u-1" });
        const present = await app.inject({
          method: "POST",
          url: "/api/auth/forgot-password",
          payload: { email: "real@example.com" },
        });
        userFindUnique.mockResolvedValue(null);
        const missing = await app.inject({
          method: "POST",
          url: "/api/auth/forgot-password",
          payload: { email: "ghost@example.com" },
        });
        // Both must be the misconfigured-deployment 500 — equality alone
        // would pass even if hqAppBase() never threw on either path.
        expect(present.statusCode).toBe(500);
        expect(missing.statusCode).toBe(500);
      } finally {
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
        if (previousHqUrl === undefined) delete process.env.HQ_APP_URL;
        else process.env.HQ_APP_URL = previousHqUrl;
      }
    });

    it("resets with a valid token and rejects reuse", async () => {
      const rawToken = "raw-reset-token-value-123456";
      resetTokenFindUnique.mockResolvedValue({
        id: "prt-1",
        userId: "u-1",
        usedAt: null,
        expiresAt: new Date(Date.now() + 30_000),
      });
      membershipFindFirst.mockResolvedValue({ organizationId: ORG, role: "owner" });

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/reset-password",
        payload: { token: rawToken, password: "a fresh strong passphrase" },
      });
      expect(response.statusCode).toBe(200);
      expect(resetTokenFindUnique).toHaveBeenCalledWith({ where: { tokenHash: sha256(rawToken) } });

      // Second use of the same token: the row now reads as used.
      resetTokenFindUnique.mockResolvedValue({
        id: "prt-1",
        userId: "u-1",
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 30_000),
      });
      const replay = await app.inject({
        method: "POST",
        url: "/api/auth/reset-password",
        payload: { token: rawToken, password: "another fresh passphrase" },
      });
      expect(replay.statusCode).toBe(400);
    });

    it("rejects expired and garbage tokens", async () => {
      resetTokenFindUnique.mockResolvedValue({
        id: "prt-1",
        userId: "u-1",
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      const expired = await app.inject({
        method: "POST",
        url: "/api/auth/reset-password",
        payload: { token: "raw-reset-token-value-123456", password: "a fresh strong passphrase" },
      });
      expect(expired.statusCode).toBe(400);

      resetTokenFindUnique.mockResolvedValue(null);
      const garbage = await app.inject({
        method: "POST",
        url: "/api/auth/reset-password",
        payload: { token: "not-a-real-token-at-all-xxx", password: "a fresh strong passphrase" },
      });
      expect(garbage.statusCode).toBe(400);
    });
  });

  describe("team invites", () => {
    it("requires an office role — technicians cannot invite", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/team/invites",
        headers: { authorization: bearer("technician") },
        payload: { email: "new@tech.example", role: "technician" },
      });
      expect(response.statusCode).toBe(403);
      expect(inviteCreate).not.toHaveBeenCalled();
    });

    it("creates an invite scoped to the caller's org and returns the share link", async () => {
      membershipFindFirst.mockResolvedValue(null);
      inviteFindFirst.mockResolvedValue(null);
      orgFindUnique.mockResolvedValue({ name: "Mallee Plumbing" });
      inviteCreate.mockResolvedValue({
        id: "inv-1",
        email: "new@tech.example",
        role: "technician",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/team/invites",
        headers: { authorization: bearer("owner") },
        payload: { email: "new@tech.example", role: "technician", name: "New Tech" },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      // No email provider configured → link delivery (the honest fallback).
      expect(body.delivery).toBe("link");
      expect(body.inviteUrl).toMatch(/\/invite\//);
      expect(inviteCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ orgId: ORG, role: "technician" }),
      });
      // The stored token is the hash, never the URL's raw token.
      const raw = body.inviteUrl.split("/invite/")[1];
      expect(inviteCreate.mock.calls[0][0].data.tokenHash).toBe(sha256(raw));
    });

    it("accepts an invite once at exactly the invited role", async () => {
      const raw = "invite-token-abcdef-1234567890";
      inviteFindUnique.mockResolvedValue({
        id: "inv-1",
        orgId: ORG,
        email: "new@tech.example",
        name: "New Tech",
        role: "technician",
        acceptedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      inviteUpdateMany.mockResolvedValue({ count: 1 });
      userFindUnique.mockResolvedValue(null);
      userCreate.mockResolvedValue({ id: "u-new", email: "new@tech.example" });
      membershipUpsert.mockResolvedValue({ id: "m-new" });

      const accept = await app.inject({
        method: "POST",
        url: `/api/invites/${raw}/accept`,
        payload: { password: "my own strong passphrase" },
      });
      expect(accept.statusCode).toBe(201);
      const body = accept.json();
      expect(body.role).toBe("technician");
      expect(body.organizationId).toBe(ORG);
      expect(membershipUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { organizationId: ORG, userId: "u-new", role: "technician" },
        }),
      );

      // Replay: updateMany now claims zero rows (already accepted).
      inviteUpdateMany.mockResolvedValue({ count: 0 });
      const replay = await app.inject({
        method: "POST",
        url: `/api/invites/${raw}/accept`,
        payload: { password: "another strong passphrase" },
      });
      expect(replay.statusCode).toBe(410);
    });

    it("rejects expired or revoked invites", async () => {
      inviteFindUnique.mockResolvedValue({
        id: "inv-1",
        orgId: ORG,
        email: "new@tech.example",
        role: "technician",
        acceptedAt: null,
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });
      const response = await app.inject({
        method: "POST",
        url: "/api/invites/invite-token-abcdef-1234567890/accept",
        payload: { password: "my own strong passphrase" },
      });
      expect(response.statusCode).toBe(410);
      expect(transaction).not.toHaveBeenCalled();
    });

    it("a session minted for one org cannot read another org's data", async () => {
      // The tenant hook binds every route to the session's org — a session
      // from sign-up in org A presented with an org B header is refused.
      const response = await app.inject({
        method: "GET",
        url: "/api/jobs",
        headers: {
          authorization: bearer("owner", ORG),
          "x-organization-id": "org-other",
        },
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe("auth rate limits", () => {
    // A dedicated instance with the limiter wound down — firing N+1 requests
    // against the shared app would poison the rest of the suite's bucket.
    it("rejects the N+1th login attempt inside the window", async () => {
      const previousMax = process.env.AUTH_RATE_LIMIT_MAX;
      const previousWindow = process.env.AUTH_RATE_LIMIT_WINDOW_MS;
      process.env.AUTH_RATE_LIMIT_MAX = "2";
      process.env.AUTH_RATE_LIMIT_WINDOW_MS = "60000";
      const limited = await buildApp({ logger: false });
      try {
        await limited.ready();
        userFindUnique.mockResolvedValue(null);
        const first = await limited.inject({ method: "POST", url: "/api/auth/login", payload: { email: "a@b.example", password: "x" } });
        const second = await limited.inject({ method: "POST", url: "/api/auth/login", payload: { email: "a@b.example", password: "x" } });
        const third = await limited.inject({ method: "POST", url: "/api/auth/login", payload: { email: "a@b.example", password: "x" } });
        expect(first.statusCode).toBe(401);
        expect(second.statusCode).toBe(401);
        expect(third.statusCode).toBe(429);
      } finally {
        await limited.close();
        if (previousMax === undefined) delete process.env.AUTH_RATE_LIMIT_MAX;
        else process.env.AUTH_RATE_LIMIT_MAX = previousMax;
        if (previousWindow === undefined) delete process.env.AUTH_RATE_LIMIT_WINDOW_MS;
        else process.env.AUTH_RATE_LIMIT_WINDOW_MS = previousWindow;
      }
    });
  });
});
