import type { FastifyRequest } from "fastify";
import { MEDIA_URL_TTL_SECONDS, signMediaReadQuery } from "./storage";

/**
 * Mint a SIGNED, absolute media read URL (P1-6). The asset cuid alone used
 * to be a forever capability; every URL the API hands out now expires
 * (MEDIA_URL_TTL_SECONDS, default 7 days) and /api/media/:id/file verifies
 * the signature. Clients re-mint on every board pull / sync, so live
 * surfaces always hold fresh URLs.
 *
 * Production builds the base from PUBLIC_API_BASE_URL only — deriving it
 * from the request's Host would let a poisoned Host header persist
 * attacker-chosen URLs. Dev/test fall back to request-host derivation.
 * Returns null in production without the env — callers degrade honestly.
 */
export function signedMediaReadUrl(request: FastifyRequest, assetId: string): string | null {
  const configured = process.env.PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, "");
  const query = signMediaReadQuery(assetId, Math.floor(Date.now() / 1000) + MEDIA_URL_TTL_SECONDS);
  if (!query) return null;
  if (configured) return `${configured}/api/media/${assetId}/file?${query}`;
  if (process.env.NODE_ENV === "production") return null;
  const proto = request.protocol === "https" || request.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  const host = (request.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim() ?? request.headers.host ?? "localhost:8080";
  return `${proto}://${host}/api/media/${assetId}/file?${query}`;
}
