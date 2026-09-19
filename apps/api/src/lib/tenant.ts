import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { getBearerToken, isLegacyTenantFallbackAllowed, sendUnauthorized, verifyAuthToken, type AuthClaims } from "./auth";
import { loadActiveSession, touchSession } from "./sessions";

const SESSION_COOKIE = "plumbtrack_hq_session";

export const ORG_HEADER = "x-organization-id";

declare module "fastify" {
  interface FastifyRequest {
    organizationId?: string;
    auth?: AuthClaims;
  }
}

/**
 * Resolves the organization from a signed bearer session. The legacy header
 * is accepted only in explicit development/test environments (or when
 * PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER=true) to keep the local demo and
 * existing test fixtures usable; everywhere else the API fails closed and
 * requires a bearer session whose claims carry the tenant.
 */
export const tenantPlugin = fp(
  async (app: FastifyInstance) => {
    app.addHook("onRequest", async (request, reply) => {
      const url = request.url.split("?")[0];

      // HQ operator sign-in is intentionally public: in production the route
      // answers 410 (retired), in dev/test it enforces the legacy header.
      // Production callers presented their raw secret as a bearer token, so
      // the signed-session checks below must not run against it.
      // Account auth is public by definition — sign-up, login and the
      // password-reset pair can't present a session that doesn't exist yet.
      // Each route carries the AUTH_RATE_LIMIT and mints the session itself.
      if (
        request.method === "POST" &&
        (url === "/api/auth/sign-up" ||
          url === "/api/auth/login" ||
          url === "/api/auth/forgot-password" ||
          url === "/api/auth/reset-password" ||
          // Retired device enrollment: the route always answers 410, in
          // every environment, to any caller — it must stay reachable so
          // old field builds get a definitive answer instead of a 401 they
          // would retry forever.
          url === "/api/auth/device")
      ) {
        return;
      }

      // Invite links are the capability: the validity peek and the accept
      // POST are unauthenticated (rate-limited, token hashed at rest).
      if (request.method === "GET" && /^\/api\/invites\/[^/]+$/.test(url)) return;
      if (request.method === "POST" && /^\/api\/invites\/[^/]+\/accept$/.test(url)) return;

      if (url === "/api/auth/hq-session") {
        if (!isLegacyTenantFallbackAllowed()) return; // route answers 410 in production
        const legacyValue = request.headers[ORG_HEADER];
        if (typeof legacyValue === "string" && legacyValue.trim().length > 0) {
          request.organizationId = legacyValue.trim();
          request.auth = {
            userId: "legacy-development-user",
            organizationId: request.organizationId,
            role: "owner",
            expiresAt: Number.MAX_SAFE_INTEGER,
          };
        }
        return;
      }

      // The live stream presents its session token as a query parameter
      // (browser WebSockets cannot set headers); the stream route verifies
      // the token itself and derives the org channel from the VERIFIED
      // claims, never from client input.
      if (url === "/api/stream") {
        return;
      }

      // Media file reads are public <img>/<Image> loads: the route is keyed
      // by the asset cuid, an unguessable capability token (like a signed URL
      // but stable for caching). No auth header exists on a browser image
      // request, so the hook must not 401 here.
      if (request.method === "GET" && /^\/api\/media\/[^/]+\/file$/.test(url)) {
        return;
      }

      // Healthchecks (Railway and load balancers) hit /api/health with no
      // session — a 401 there fails the deployment's health probe. The route
      // exposes only service liveness, never tenant data.
      if (request.method === "GET" && url === "/api/health") {
        return;
      }

      // Provider webhooks (Stripe payments, Slack events) authenticate with
      // their own HMAC signature schemes — they cannot present a tenant
      // session. The routes verify the provider signature themselves (with
      // timing-safe comparison and freshness windows) before touching data,
      // so exempting them here keeps them reachable without opening tenant
      // access to anything else.
      if (
        request.method === "POST" &&
        (url === "/api/webhooks/stripe" || url === "/api/slack/events")
      ) {
        return;
      }

      // The Slack OAuth redirect: Slack's servers land the installer's browser
      // here with ?code=…&state=… — no tenant session can exist yet. The
      // callback validates the signed state (timing-safe) and exchanges the
      // code itself; it never touches tenant data before that.
      if (request.method === "GET" && url === "/api/slack/oauth/callback") {
        return;
      }

      // The generic integration OAuth callback: the provider's redirect
      // lands the operator's browser here with ?code=…&state=…. Its real
      // authorization is the single-use signed state row the route
      // validates — gating it on a tenant session cookie adds a failure
      // mode (an expired cookie mid-round-trip silently fails the
      // connection) with zero security gain.
      if (request.method === "GET" && /^\/api\/integrations\/oauth\/callback\/[^/]+$/.test(url)) {
        return;
      }

      // Root liveness returns only {service, status} — the same class of
      // information as /api/health, never tenant data.
      if (request.method === "GET" && url === "/") {
        return;
      }

      const bearer = getBearerToken(request) ?? request.cookies?.[SESSION_COOKIE] ?? null;
      if (bearer) {
        const claims = verifyAuthToken(bearer);
        if (!claims) {
          return sendUnauthorized(reply);
        }
        const requestedOrg = request.headers[ORG_HEADER];
        if (typeof requestedOrg === "string" && requestedOrg.trim() && requestedOrg.trim() !== claims.organizationId) {
          return reply.code(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: "The requested organization does not match the authenticated session",
          });
        }
        if (claims.sid) {
          // Revocable sessions: every request re-reads the row — no cache,
          // because a TTL'd cache is the revocation lag this removes. The
          // row's role wins over the token's, so a role change applies on
          // the next request, not the next login.
          const session = await loadActiveSession(claims.sid);
          if (!session || session.userId !== claims.userId || session.organizationId !== claims.organizationId) {
            return sendUnauthorized(reply);
          }
          void touchSession(claims.sid).catch(() => undefined);
          request.auth = { ...claims, role: session.role };
          request.organizationId = claims.organizationId;
          return;
        }
        // Tokens minted before sessions existed carry no sid. Dev/test may
        // still present them (fixtures, legacy rehearsals); production
        // rejects them outright — this is the intended one-time cutover.
        if (!isLegacyTenantFallbackAllowed()) {
          return sendUnauthorized(reply);
        }
        request.auth = claims;
        request.organizationId = claims.organizationId;
        return;
      }

      if (isLegacyTenantFallbackAllowed()) {
        const value = request.headers[ORG_HEADER];
        if (typeof value === "string" && value.trim().length > 0) {
          request.organizationId = value.trim();
          // Legacy requests are intentionally treated as owner-level only in
          // development/test environments. They are rejected in production.
          request.auth = {
            userId: "legacy-development-user",
            organizationId: request.organizationId,
            role: "owner",
            expiresAt: Number.MAX_SAFE_INTEGER,
          };
        }
        return;
      }

      // Do not accept a client-selected organization in production.
      return sendUnauthorized(reply);
    });
  },
  { name: "tenant" },
);

export function getOrgId(request: FastifyRequest): string | undefined {
  return request.auth?.organizationId ?? request.organizationId;
}

export function sendMissingOrg(reply: FastifyReply): FastifyReply {
  if (!isLegacyTenantFallbackAllowed()) return sendUnauthorized(reply);
  return reply.code(400).send({
    statusCode: 400,
    error: "Bad Request",
    message: `Missing required "${ORG_HEADER}" header`,
  });
}
