import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "@plumbtrack/database";
import { DEVICE_SESSION_SECONDS, HQ_SESSION_SECONDS, issueAuthToken, type OrganizationRole } from "../lib/auth";
import { createSession } from "../lib/sessions";
import { recordAuditEvent } from "../lib/audit";
import { sendEmail } from "../lib/email";
import { hashPassword, passwordProblem, verifyPassword } from "../lib/passwords";
import { hqAppBase } from "../lib/urls";
import { parseBody, sendValidationError } from "../lib/validation";

/**
 * Real account auth — sign-up, login, password reset. These routes are
 * public (the tenant hook exempts them) and each mints the same signed
 * session the bootstrap paths issue: a real `User.id` as `userId`, the
 * member's role from `OrganizationMembership`, the org they belong to.
 *
 * Security contract (docs/AUTH_LOGIN_HANDOVER_PROMPT.md §7):
 *  - generic errors AND identical argon2 work on login/forgot — neither the
 *    response body nor its timing leaks which emails exist;
 *  - per-IP AUTH_RATE_LIMIT + per-account lockout counters;
 *  - reset tokens random 32 bytes, SHA-256'd at rest, single-use, 1h TTL;
 *  - passwords argon2id-hashed, never logged or returned;
 *  - every event audited.
 */

const SESSION_COOKIE = "plumbtrack_hq_session";
const COOKIE_OPTIONS = {
  httpOnly: true,
  // Cross-origin console↔API deployments need None+Secure for the cookie to
  // ride credentialed fetches; lax never sends on cross-site XHR (the
  // 2026-09-16 login fix — SameSite=Lax left production sign-in unable to
  // persist). Dev keeps lax since localhost is same-site.
  sameSite: (process.env.NODE_ENV === "production" ? "none" : "lax") as "none" | "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

/** Session-minting routes get their own tight limiter, on top of the global
 *  per-IP cap — mirrors AUTH_RATE_LIMIT in auth.ts. Read at registration so
 *  tests can tune it per app instance. */
const authRateLimit = () => ({
  max: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10),
  timeWindow: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 60_000),
});

/** Per-account lockout: distributed guessing across IPs still burns out. */
const LOGIN_LOCKOUT_AFTER = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
/** Reset links live one hour; invite links seven days. */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

const GENERIC_LOGIN_ERROR = "Incorrect email or password.";

const emailSchema = z.string().trim().toLowerCase().email().max(254);

const signUpSchema = z.object({
  businessName: z.string().trim().min(2).max(80),
  name: z.string().trim().min(2).max(80),
  email: emailSchema,
  password: z.string().min(1).max(256),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});

const forgotSchema = z.object({ email: emailSchema });

const resetSchema = z.object({
  token: z.string().trim().min(20).max(128),
  password: z.string().min(1).max(256),
});

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

let dummyHashPromise: Promise<string> | null = null;
/** Verify against a throwaway hash when no account/password exists, so an
 *  unknown email costs the same argon2 work as a known one — otherwise the
 *  response time itself enumerates accounts. */
function dummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(randomBytes(32).toString("hex"));
  return dummyHashPromise;
}

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "business";
  return `${base}-${randomBytes(3).toString("hex")}`;
}

async function signIn(userId: string, organizationId: string, role: OrganizationRole, name: string | null, request: FastifyRequest, reply: FastifyReply) {
  // Field technicians get the 30-day device session — a 12h window would log
  // them out mid-shift with no way to re-auth on site. Office roles keep the
  // shift-length session. The same asymmetry governs /api/auth/renew: a
  // shorter session can never extend itself to the longer one.
  const sessionSeconds = role === "technician" ? DEVICE_SESSION_SECONDS : HQ_SESSION_SECONDS;
  const expiresAt = Math.floor(Date.now() / 1000) + sessionSeconds;
  // One sessions row per device sign-in — this is what makes the token
  // revocable (the tenant hook re-reads the row on every request).
  const sessionRow = await createSession({
    userId,
    organizationId,
    role,
    expiresInSeconds: sessionSeconds,
    userAgent: request.headers["user-agent"] ?? null,
    ip: request.ip,
  });
  const token = issueAuthToken({ userId, organizationId, role, expiresInSeconds: sessionSeconds, sessionId: sessionRow.id });
  reply.setCookie(SESSION_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: sessionSeconds });
  // The tenant hook exempts these public routes, so attach verified claims
  // manually — the audit event must be actor-scoped.
  request.auth = { userId, organizationId, role, expiresAt, sid: sessionRow.id };
  request.organizationId = organizationId;
  // Resolved at mint time, not carried in the claims — the field app shows
  // this name to customers (ETA SMS, profile), so an org rename must reach
  // devices without a re-login.
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });
  return { token, userId, organizationId, organizationName: org?.name ?? null, role, expiresAt, name };
}

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Create a business: Organization + User + owner Membership + OrgSetup in
   * one transaction, then sign the owner in. No bootstrap token.
   */
  app.post("/sign-up", { config: { rateLimit: authRateLimit() } }, async (request, reply) => {
    const parsed = parseBody(signUpSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const { businessName, name, email, password } = parsed.data;

    const weak = passwordProblem(password);
    if (weak) {
      return reply.code(400).send({ message: weak, issues: [{ path: "password", message: weak }] });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.code(409).send({ message: "An account already exists with that email — sign in instead." });
    }

    const passwordHash = await hashPassword(password);
    const created = await prisma.$transaction(async tx => {
      const organization = await tx.organization.create({
        data: { name: businessName, slug: slugify(businessName) },
      });
      const user = await tx.user.create({
        data: { email, name, passwordHash },
      });
      await tx.organizationMembership.create({
        data: { organizationId: organization.id, userId: user.id, role: "owner" },
      });
      // Same first-read contract as routes/setup.ts — the wizard mounts on it.
      await tx.orgSetup.create({ data: { orgId: organization.id } });
      return { organization, user };
    });

    const session = await signIn(created.user.id, created.organization.id, "owner", name, request, reply);
    recordAuditEvent(request, {
      action: "auth.sign_up",
      entityType: "organization",
      entityId: created.organization.id,
      metadata: { role: "owner" },
    });
    return reply.code(201).send(session);
  });

  /**
   * Email + password login. Failure responses are deliberately identical for
   * unknown email vs wrong password — no account enumeration. Per-account
   * counters lock after repeated failures independent of the IP limiter.
   */
  app.post("/login", { config: { rateLimit: authRateLimit() } }, async (request, reply) => {
    const parsed = parseBody(loginSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { memberships: { orderBy: { createdAt: "asc" } } },
    });
    const membership = user?.memberships[0];

    if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      return reply.code(429).send({
        message: "Too many attempts — this account is locked for a few minutes. Try again shortly.",
      });
    }

    // An expired lock restarts the count — otherwise failedLoginCount stays
    // at the threshold forever and one wrong guess re-locks the account.
    const lockExpired = Boolean(user?.lockedUntil && user.lockedUntil.getTime() <= Date.now());
    const priorFailures = lockExpired ? 0 : (user?.failedLoginCount ?? 0);

    // Always one argon2 verify: an unknown email (or an invited user with no
    // password yet) must cost the same as a wrong password on a real account.
    const verified = await verifyPassword(user?.passwordHash ?? (await dummyHash()), password);
    if (!user || !membership || !verified) {
      if (user) {
        const failedLoginCount = priorFailures + 1;
        const locked = failedLoginCount >= LOGIN_LOCKOUT_AFTER;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount,
            ...(locked
              ? { lockedUntil: new Date(Date.now() + LOGIN_LOCKOUT_MS) }
              : lockExpired ? { lockedUntil: null } : {}),
          },
        }).catch(() => undefined);
      }
      recordAuditEvent(request, {
        action: "auth.login_failed",
        entityType: "user",
        entityId: user?.id,
        metadata: { reason: "bad_credentials" },
      });
      return reply.code(401).send({ message: GENERIC_LOGIN_ERROR });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    }).catch(() => undefined);

    const session = await signIn(user.id, membership.organizationId, membership.role, user.name, request, reply);
    recordAuditEvent(request, {
      action: "auth.login",
      entityType: "session",
      metadata: { role: membership.role },
    });
    return session;
  });

  /**
   * Request a password-reset link. The response is identical whether or not
   * the email exists; `delivery` reports deployment state (provider
   * configured or not), never account existence. Unconfigured deployments
   * log the user id server-side so an operator can reset manually.
   */
  app.post("/forgot-password", { config: { rateLimit: authRateLimit() } }, async (request, reply) => {
    const parsed = parseBody(forgotSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const { email } = parsed.data;

    // Resolved before the account lookup so a missing HQ_APP_URL fails
    // identically for every caller — never a 500 that only registered
    // emails can trigger (which would itself enumerate accounts).
    const base = hqAppBase();
    const user = await prisma.user.findUnique({ where: { email } });
    let delivered = false;
    if (user) {
      const rawToken = randomBytes(32).toString("base64url");
      const resetUrl = `${base}/reset-password?token=${rawToken}`;
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: sha256(rawToken),
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      }).catch(() => undefined);
      try {
        const result = await sendEmail(
          email,
          "Reset your Crewline password",
          `Someone asked to reset the password for this account.\n\n${resetUrl}\n\nThe link works once and expires in one hour. If this wasn't you, ignore this email.`,
        );
        delivered = result.delivered;
      } catch {
        delivered = false;
      }
      if (!delivered) {
        // No email provider (or it failed): surface for a manual reset
        // without logging PII or the token.
        request.log.warn({ userId: user.id }, "password reset requested but no email provider delivered it");
      }
    }

    return reply.code(202).send({ ok: true, delivery: delivered ? "email" : "unconfigured" });
  });

  /**
   * Redeem a reset token: hashed lookup, unexpired, unused. Sets the new
   * password, burns the token, and clears lockout counters.
   */
  app.post("/reset-password", { config: { rateLimit: authRateLimit() } }, async (request, reply) => {
    const parsed = parseBody(resetSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const { token, password } = parsed.data;

    const weak = passwordProblem(password);
    if (weak) {
      return reply.code(400).send({ message: weak, issues: [{ path: "password", message: weak }] });
    }

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      return reply.code(400).send({ message: "That reset link is expired or already used — request a new one." });
    }

    const passwordHash = await hashPassword(password);
    await prisma.$transaction([
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      }),
    ]);

    // Audit without a session: scope to the user's org directly.
    const membership = await prisma.organizationMembership.findFirst({
      where: { userId: record.userId },
      orderBy: { createdAt: "asc" },
    });
    if (membership) {
      request.organizationId = membership.organizationId;
      request.auth = {
        userId: record.userId,
        organizationId: membership.organizationId,
        role: membership.role,
        expiresAt: Number.MAX_SAFE_INTEGER,
      };
      recordAuditEvent(request, {
        action: "auth.password_reset",
        entityType: "user",
        entityId: record.userId,
      });
    }

    return { ok: true };
  });
}
