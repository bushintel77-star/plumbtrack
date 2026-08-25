import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { getBearerToken, isLegacyTenantFallbackAllowed, sendUnauthorized, verifyAuthToken, type AuthClaims } from "./auth";

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

      // Device enrollment is intentionally public: the route enforces the
      // deployment bootstrap secret (production) or the legacy dev header.
      // Production enrollment presents its raw secret as a bearer token, so
      // the signed-session checks below must not run against it.
      if (url === "/api/auth/device") {
        if (!isLegacyTenantFallbackAllowed()) return; // route enforces bootstrap
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

      const bearer = getBearerToken(request);
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
