import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { getBearerToken, isLegacyTenantFallbackAllowed, issueAuthToken, sendUnauthorized, type OrganizationRole } from "../lib/auth";
import { getOrgId, sendMissingOrg } from "../lib/tenant";
import { recordAuditEvent } from "../lib/audit";

/** Field devices re-enroll at most daily; a 30-day session survives quiet periods. */
const DEVICE_SESSION_SECONDS = 30 * 24 * 60 * 60;
/** HQ station sessions are shift-length; the toolbar renews every 15 minutes. */
const HQ_SESSION_SECONDS = 12 * 60 * 60;
/** Roles an HQ operator session may carry — never the field `technician` role. */
const HQ_STATION_ROLES = ["dispatcher", "manager", "accountant", "admin", "owner"] as const;
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
    });
    return { token, organizationId: request.auth.organizationId, role: request.auth.role };
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

  /**
   * HQ operator sign-in — the station counterpart of device enrollment and
   * the prerequisite for disabling the legacy tenant header in production.
   *
   * Development/test: the legacy `x-organization-id` header signs in an
   * owner-level session, preserving the local demo and test fixtures.
   *
   * Production: the operator presents the deployment's shared bootstrap
   * secret (`HQ_BOOTSTRAP_TOKEN`) as a bearer token; the minted session
   * carries `HQ_OPERATOR_ROLE` (default `owner`) for `HQ_ORG_ID` (fallback
   * `DEVICE_ORG_ID`). The secret is a station-access key entered at the
   * keyboard — never baked into the web bundle — not an account.
   */
  app.post("/hq-session", async (request, reply) => {
    const production = !isLegacyTenantFallbackAllowed();

    let orgId: string | undefined;
    let role: OrganizationRole;

    if (production) {
      const bootstrapToken = process.env.HQ_BOOTSTRAP_TOKEN?.trim();
      const presented = getBearerToken(request);
      if (!bootstrapToken || !presented || !safeEqual(presented, bootstrapToken)) {
        return sendUnauthorized(reply);
      }
      orgId = (process.env.HQ_ORG_ID ?? process.env.DEVICE_ORG_ID)?.trim();
      if (!orgId) {
        return reply.code(500).send({
          statusCode: 500,
          error: "Server Error",
          message: "HQ_ORG_ID (or DEVICE_ORG_ID) must be configured for HQ sign-in",
        });
      }
      const configuredRole = (process.env.HQ_OPERATOR_ROLE ?? "owner").trim() as (typeof HQ_STATION_ROLES)[number];
      if (!HQ_STATION_ROLES.includes(configuredRole)) {
        return reply.code(500).send({
          statusCode: 500,
          error: "Server Error",
          message: `HQ_OPERATOR_ROLE must be one of: ${HQ_STATION_ROLES.join(", ")}`,
        });
      }
      role = configuredRole;
    } else {
      orgId = getOrgId(request);
      if (!orgId) return sendMissingOrg(reply);
      role = "owner";
    }

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
