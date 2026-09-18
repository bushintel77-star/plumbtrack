import type { FastifyInstance } from "fastify";
import { prisma } from "@plumbtrack/database";
import { DEVICE_SESSION_SECONDS, HQ_SESSION_SECONDS, isLegacyTenantFallbackAllowed, issueAuthToken, sendUnauthorized, type OrganizationRole } from "../lib/auth";
import { revokeSession } from "../lib/sessions";
import { getOrgId, sendMissingOrg } from "../lib/tenant";
import { recordAuditEvent } from "../lib/audit";

const SESSION_COOKIE = "plumbtrack_hq_session";
// Cross-origin console↔API deployments need SameSite=None+Secure or the
// session cookie never rides credentialed fetches (Lax doesn't send on
// cross-site XHR — production sign-in silently couldn't persist before this).
const COOKIE_OPTIONS = { httpOnly: true, sameSite: (process.env.NODE_ENV === "production" ? "none" : "lax") as "none" | "lax", secure: process.env.NODE_ENV === "production", path: "/" };

/**
 * Session-minting routes get their own tight limiter, on top of the global
 * per-IP cap: bootstrap-secret guessing must burn out in seconds, not ride a
 * 500/min shared budget (2026-09-07 stress test measured 1,272 req/s of
 * wrong-token guesses with zero throttling before this limiter existed).
 */
const AUTH_RATE_LIMIT = {
  max: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10),
  timeWindow: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 60_000),
};

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get("/session", async (request, reply) => {
    if (!request.auth) return sendUnauthorized(reply);
    // Resolve the display name and the org's trading name per request rather
    // than baking them into the signed claims — a renamed user/org would
    // otherwise keep stale names until re-login, and every token would carry
    // PII it doesn't need. The membership join fetches both in one round
    // trip; a claims pair with no membership (legacy/dev sessions) reads as
    // null, never a 500.
    const membership = await prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: request.auth.organizationId,
          userId: request.auth.userId,
        },
      },
      select: {
        user: { select: { name: true } },
        organization: { select: { name: true } },
      },
    });
    return {
      authenticated: true,
      userId: request.auth.userId,
      organizationId: request.auth.organizationId,
      organizationName: membership?.organization.name ?? null,
      role: request.auth.role,
      expiresAt: request.auth.expiresAt,
      name: membership?.user.name ?? null,
    };
  });

  /**
   * Stream token for an already-authenticated caller. The HQ console's
   * session is an HTTP-only cookie, so the browser can't read the raw bearer
   * to put in the WebSocket query string. This endpoint re-mints a signed
   * session token from the VERIFIED cookie claims (org and role preserved),
   * which the client uses only for `/api/stream?token=…`. It is bounded by
   * the same AUTH_SECRET and is never exposed as an account credential.
   */
  app.get("/stream-token", async (request, reply) => {
    if (!request.auth) return sendUnauthorized(reply);
    const token = issueAuthToken({
      userId: request.auth.userId,
      organizationId: request.auth.organizationId,
      role: request.auth.role,
      expiresInSeconds: 15 * 60,
      // Same session row — the stream token is a second view of the
      // caller's session, never a second session.
      sessionId: request.auth.sid,
    });
    return { token, organizationId: request.auth.organizationId, role: request.auth.role };
  });

  /**
   * Device enrollment — retired everywhere. The shared
   * `DEVICE_BOOTSTRAP_TOKEN` shipped inside the public field-app bundle, so
   * anyone who read the bundle could mint a 30-day technician session and
   * read the whole customer list (demonstrated live against production
   * 2026-09-17). Real accounts (`/api/auth/login`, invites) are the only way
   * in: sessions carry a real `User.id` and the member's actual role.
   */
  app.post("/device", { config: { rateLimit: AUTH_RATE_LIMIT } }, async (_request, reply) => {
    return reply.code(410).send({
      statusCode: 410,
      error: "Gone",
      message: "Device-token enrollment is retired. Sign in with email and password at /api/auth/login.",
    });
  });

  /**
   * HQ operator sign-in — dev/test only. The legacy `x-organization-id`
   * header signs in an owner-level session, preserving local fixtures.
   *
   * Production answers 410: real accounts (`/api/auth/sign-up`, `/login`,
   * team invites) replaced the shared `HQ_BOOTSTRAP_TOKEN` station key —
   * sessions now carry a real `User.id` and the member's actual role.
   */
  app.post("/hq-session", { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request, reply) => {
    const production = !isLegacyTenantFallbackAllowed();

    // Production retired the shared station secret (P0-1): real accounts
    // (POST /api/auth/sign-up, /login, invites) are the only way in. The
    // token path stays for dev/test so local fixtures keep working.
    if (production) {
      return reply.code(410).send({
        statusCode: 410,
        error: "Gone",
        message: "Station-token sign-in is retired. Sign in with email and password at /login.",
      });
    }

    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const role: OrganizationRole = "owner";

    const expiresAt = Math.floor(Date.now() / 1000) + HQ_SESSION_SECONDS;
    const token = issueAuthToken({
      userId: "hq-operator",
      organizationId: orgId,
      role,
      expiresInSeconds: HQ_SESSION_SECONDS,
    });

    reply.setCookie(SESSION_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: HQ_SESSION_SECONDS });

    // The tenant hook deliberately skips this path, so attach the verified
    // claims manually to keep the audit event actor-scoped.
    request.auth = { userId: "hq-operator", organizationId: orgId, role, expiresAt };
    recordAuditEvent(request, {
      action: "auth.hq_sign_in",
      entityType: "session",
      metadata: { role, organizationId: orgId },
    });

    return reply.code(201).send({ token, organizationId: orgId, role, expiresAt });
  });

  app.post("/renew", async (request, reply) => {
    if (!request.auth) return sendUnauthorized(reply);
    // Renewal re-issues the caller's own role TTL — never an upgrade: a 12h
    // HQ station session must not be able to extend itself to a 30-day
    // field-device session (that asymmetry is what DEVICE_SESSION_SECONDS
    // exists to prevent).
    const sessionSeconds = request.auth.role === "technician" ? DEVICE_SESSION_SECONDS : HQ_SESSION_SECONDS;
    const expiresAt = Math.floor(Date.now() / 1000) + sessionSeconds;
    // Extend the EXISTING session row and re-issue a token on the same sid —
    // a 30-day technician session renewing every 15 minutes must not spawn
    // a new row per renewal (the device list would drown in dead rows).
    // updateMany is a no-op if the row vanished between the hook and here.
    if (request.auth.sid) {
      await prisma.session.updateMany({
        where: { id: request.auth.sid, revokedAt: null },
        data: { expiresAt: new Date(expiresAt * 1000), lastSeenAt: new Date() },
      });
    }
    const token = issueAuthToken({ userId: request.auth.userId, organizationId: request.auth.organizationId, role: request.auth.role, expiresInSeconds: sessionSeconds, sessionId: request.auth.sid });
    reply.setCookie(SESSION_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: sessionSeconds });
    const org = await prisma.organization.findUnique({
      where: { id: request.auth.organizationId },
      select: { name: true },
    });
    return { authenticated: true, organizationId: request.auth.organizationId, organizationName: org?.name ?? null, role: request.auth.role, expiresAt };
  });

  app.post("/sign-out", async (request, reply) => {
    // Actually end the session — clearing only the cookie left the bearer
    // token valid until expiry, which made logging out cosmetic.
    if (request.auth?.sid) {
      await revokeSession(request.auth.sid, "sign_out");
      recordAuditEvent(request, {
        action: "auth.sign_out",
        entityType: "session",
        entityId: request.auth.sid,
        metadata: { organizationId: request.auth.organizationId },
      });
    }
    reply.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS);
    return reply.code(204).send();
  });
}
