import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

export const AUTH_HEADER = "authorization";
export const AUTH_SCHEME = "Bearer";

export const ORGANIZATION_ROLES = [
  "technician",
  "dispatcher",
  "manager",
  "accountant",
  "admin",
  "owner",
] as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export interface AuthClaims {
  userId: string;
  organizationId: string;
  role: OrganizationRole;
  expiresAt: number;
}

const DEV_SECRET = "plumbtrack-development-only-secret";

function secret(): string | null {
  const configured = process.env.AUTH_SECRET?.trim();
  if (configured) return configured;
  return productionAuthRequired() ? null : DEV_SECRET;
}

function productionAuthRequired(): boolean {
  return process.env.NODE_ENV === "production" || process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER === "false";
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signature(input: string, signingSecret: string): string {
  return createHmac("sha256", signingSecret).update(input).digest("base64url");
}

/**
 * Creates the compact token accepted by the API. In production this is
 * intended to be issued by the application's identity/session boundary, not
 * by the browser. Keeping the format local avoids coupling the API to an
 * unverified client-supplied organization header.
 */
export function issueAuthToken(input: {
  userId: string;
  organizationId: string;
  role: OrganizationRole;
  expiresInSeconds?: number;
}): string {
  const signingSecret = secret();
  if (!signingSecret) throw new Error("AUTH_SECRET must be configured before issuing production sessions");
  const payload: AuthClaims = {
    userId: input.userId,
    organizationId: input.organizationId,
    role: input.role,
    expiresAt: Math.floor(Date.now() / 1000) + (input.expiresInSeconds ?? 900),
  };
  const encoded = encode(JSON.stringify(payload));
  return `${encoded}.${signature(encoded, signingSecret)}`;
}

export function verifyAuthToken(token: string): AuthClaims | null {
  try {
    const [encoded, providedSignature] = token.split(".");
    const signingSecret = secret();
    if (!encoded || !providedSignature || !signingSecret) return null;
    const expected = signature(encoded, signingSecret);
    const provided = Buffer.from(providedSignature);
    const expectedBuffer = Buffer.from(expected);
    if (provided.length !== expectedBuffer.length || !timingSafeEqual(provided, expectedBuffer)) return null;

    const claims = JSON.parse(decode(encoded)) as Partial<AuthClaims>;
    if (
      typeof claims.userId !== "string" ||
      typeof claims.organizationId !== "string" ||
      typeof claims.expiresAt !== "number" ||
      !ORGANIZATION_ROLES.includes(claims.role as OrganizationRole) ||
      claims.expiresAt <= Math.floor(Date.now() / 1000)
    ) return null;

    return {
      userId: claims.userId,
      organizationId: claims.organizationId,
      role: claims.role as OrganizationRole,
      expiresAt: claims.expiresAt,
    };
  } catch {
    return null;
  }
}

export function getBearerToken(request: FastifyRequest): string | null {
  const value = request.headers[AUTH_HEADER];
  if (typeof value !== "string") return null;
  const [scheme, token] = value.trim().split(/\s+/);
  return scheme === AUTH_SCHEME && token ? token : null;
}

export function isLegacyTenantFallbackAllowed(): boolean {
  return !productionAuthRequired();
}

/** Fail fast rather than starting a deployment that can never authenticate. */
export function assertAuthConfiguration(): void {
  if (productionAuthRequired() && !process.env.AUTH_SECRET?.trim()) {
    throw new Error("AUTH_SECRET must be configured when production bearer authentication is enabled");
  }
}

export function sendUnauthorized(reply: FastifyReply): FastifyReply {
  return reply.code(401).send({
    statusCode: 401,
    error: "Unauthorized",
    message: "A valid bearer session is required",
  });
}

export function sendForbidden(reply: FastifyReply): FastifyReply {
  return reply.code(403).send({
    statusCode: 403,
    error: "Forbidden",
    message: "Your role cannot perform this action",
  });
}

export function requireRole(
  request: FastifyRequest,
  reply: FastifyReply,
  roles: readonly OrganizationRole[],
): FastifyReply | null {
  const auth = request.auth;
  if (!auth) return sendUnauthorized(reply);
  if (!roles.includes(auth.role)) return sendForbidden(reply);
  return null;
}
