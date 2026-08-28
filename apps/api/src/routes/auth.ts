import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { getBearerToken, isLegacyTenantFallbackAllowed, issueAuthToken, sendUnauthorized, type OrganizationRole } from "../lib/auth";
import { getOrgId, sendMissingOrg } from "../lib/tenant";

/** Field devices re-enroll at most daily; a 30-day session survives quiet periods. */
const DEVICE_SESSION_SECONDS = 30 * 24 * 60 * 60;
const SESSION_COOKIE = "plumbtrack_hq_session";
const COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get("/session", async (request, reply) => {
    if (!request.auth) return sendUnauthorized(reply);
    return {
      authenticated: true,
      userId: request.auth.userId,
      organizationId: request.auth.organizationId,
      role: request.auth.role,
      expiresAt: request.auth.expiresAt,
    };
  });

  /**
   * Device enrollment — the only way a browser gains a bearer session in
   * production (the legacy org header is rejected there).
   *
   * Development/test: the legacy `x-organization-id` header enrolls an
   * owner-level session, preserving the local demo and test fixtures.
   *
   * Production: the client presents the deployment's shared bootstrap secret
   * (`DEVICE_BOOTSTRAP_TOKEN`, mirrored as NEXT_PUBLIC_* on the web app) as a
   * bearer token. The minted session is technician-scoped — a field device
   * can record time/photos/notifications but never create jobs or escalate
   * roles — and is bounded by `AUTH_SECRET` signing. The bootstrap secret is
   * public by design; it is a device-enrollment key, not an account.
   */
  app.post("/device", async (request, reply) => {
    // The legacy header is only permitted in explicit dev/test environments;
    // anywhere else enrollment must use the deployment bootstrap secret.
    const production = !isLegacyTenantFallbackAllowed();

    let orgId: string | undefined;
    let role: OrganizationRole;

    if (production) {
      const bootstrapToken = process.env.DEVICE_BOOTSTRAP_TOKEN?.trim();
      const presented = getBearerToken(request);
      if (!bootstrapToken || !presented || !safeEqual(presented, bootstrapToken)) {
        return sendUnauthorized(reply);
      }
      orgId = process.env.DEVICE_ORG_ID?.trim();
      if (!orgId) {
        return reply.code(500).send({
          statusCode: 500,
          error: "Server Error",
          message: "DEVICE_ORG_ID must be configured for device enrollment",
        });
      }
      role = "technician";
    } else {
      orgId = getOrgId(request);
      if (!orgId) return sendMissingOrg(reply);
      role = "owner";
    }

    const body = (request.body ?? {}) as { deviceId?: unknown };
    const rawDeviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
    const userId = rawDeviceId ? rawDeviceId.slice(0, 64) : "device";

    const expiresAt = Math.floor(Date.now() / 1000) + DEVICE_SESSION_SECONDS;
    const token = issueAuthToken({
      userId,
      organizationId: orgId,
      role,
      expiresInSeconds: DEVICE_SESSION_SECONDS,
    });

    reply.setCookie(SESSION_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: DEVICE_SESSION_SECONDS });
    return reply.code(201).send({ token, organizationId: orgId, role, expiresAt });
  });

  app.post("/renew", async (request, reply) => {
    if (!request.auth) return sendUnauthorized(reply);
    const token = issueAuthToken({ userId: request.auth.userId, organizationId: request.auth.organizationId, role: request.auth.role, expiresInSeconds: DEVICE_SESSION_SECONDS });
    const expiresAt = Math.floor(Date.now() / 1000) + DEVICE_SESSION_SECONDS;
    reply.setCookie(SESSION_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: DEVICE_SESSION_SECONDS });
    return { authenticated: true, organizationId: request.auth.organizationId, role: request.auth.role, expiresAt };
  });

  app.post("/sign-out", async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS);
    return reply.code(204).send();
  });
}
