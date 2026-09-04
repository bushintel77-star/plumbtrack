import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRole } from "../lib/auth";
import { getOrgId, sendMissingOrg } from "../lib/tenant";
import { parseBody, sendValidationError } from "../lib/validation";
import { recordAuditEvent } from "../lib/audit";

/**
 * Server-side routing proxy for the HQ map. Road shapes and travel-time
 * matrices are fetched here — never from the browser — so the provider key
 * stays server-side (the old NEXT_PUBLIC key shipped in the client bundle
 * by definition).
 *
 * The upstream is OpenRouteService (POST bodies carry the coordinates; the
 * request URL is constant). Without ORS_API_KEY the proxy answers 503 and
 * the client keeps its straight-line dashed polylines — the keyless OSRM
 * demo server is deliberately NOT used server-side: it is rate-limited,
 * uncontracted, and its path-based coordinate API cannot be called without
 * putting request data in the fetch URL. A free ORS key
 * (openrouteservice.org) upgrades the whole board.
 *
 * Responses are memoised in-process by a rounded coordinate signature: a
 * single replica serves the whole board from cache after the first ask.
 */

const ORS_SHAPE_ENDPOINT = "https://api.openrouteservice.org/v2/directions/driving-car/geojson"
const ORS_MATRIX_ENDPOINT = "https://api.openrouteservice.org/v2/matrix/driving-car"

const REQUEST_TIMEOUT_MS = 8_000
const MAX_POINTS = 25
const CACHE_MAX_ENTRIES = 256

/** The only host this proxy may ever talk to. Anything else — including
 *  loopback/private addresses smuggled through configuration — is refused
 *  before a socket opens. */
const ALLOWED_UPSTREAM_HOSTS = new Set(["api.openrouteservice.org"])

/** SSRF guard: upstream request URLs are constants; this re-asserts https
 *  and the host allowlist before any fetch. Throws on anything else. */
function safeUpstreamUrl(base: string): URL {
  const url = new URL(base)
  if (url.protocol !== "https:") throw new Error("Non-https upstream refused")
  if (!ALLOWED_UPSTREAM_HOSTS.has(url.hostname)) {
    throw new Error(`Upstream host not allowed: ${url.hostname}`)
  }
  return url
}

const round3 = (n: number) => Math.round(n * 1000) / 1000

const coordSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])

const shapeQuerySchema = z.object({
  /** "lng,lat;lng,lat;…" — MapLibre coordinate order. */
  stops: z.string().trim().min(1),
})

const matrixQuerySchema = z.object({
  points: z.string().trim().min(1),
})

function parseCoordList(raw: string): [number, number][] | null {
  const pairs: [number, number][] = []
  for (const chunk of raw.split(";")) {
    const [lngRaw, latRaw] = chunk.split(",")
    const lng = Number(lngRaw)
    const lat = Number(latRaw)
    const parsed = coordSchema.safeParse([lng, lat])
    if (!parsed.success) return null
    pairs.push(parsed.data)
  }
  if (pairs.length < 2 || pairs.length > MAX_POINTS) return null
  return pairs
}

function signatureOf(points: [number, number][]): string {
  return points.map(([lng, lat]) => `${round3(lng)},${round3(lat)}`).join("|")
}

/** Tiny LRU: insertion-ordered Map, pruned from the front past the cap. */
function cacheGet<T>(cache: Map<string, T>, key: string): T | undefined {
  const hit = cache.get(key)
  if (hit !== undefined) {
    cache.delete(key)
    cache.set(key, hit)
  }
  return hit
}

function cacheSet<T>(cache: Map<string, T>, key: string, value: T): void {
  if (cache.has(key)) cache.delete(key)
  cache.set(key, value)
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

const shapeCache = new Map<string, { coordinates: [number, number][]; source: "ors" }>()
const matrixCache = new Map<string, { durations: number[][]; source: "ors" }>()

type ShapeResult = { coordinates: [number, number][]; source: "ors" } | null
type MatrixResult = { durations: number[][]; source: "ors" } | null

/** ORS directions with the server key. Coordinates ride in the POST body —
 *  the fetch URL is a constant. Never throws. */
async function orsShape(points: [number, number][], apiKey: string): Promise<ShapeResult> {
  try {
    const res = await fetch(safeUpstreamUrl(ORS_SHAPE_ENDPOINT), {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ coordinates: points }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { features?: Array<{ geometry?: { coordinates?: unknown } }> }
    const coords = body.features?.[0]?.geometry?.coordinates
    return Array.isArray(coords) && coords.length >= 2
      ? { coordinates: coords, source: "ors" }
      : null
  } catch {
    return null
  }
}

/** ORS duration matrix — same constant-URL, body-carries-data pattern. */
async function orsMatrix(points: [number, number][], apiKey: string): Promise<MatrixResult> {
  try {
    const res = await fetch(safeUpstreamUrl(ORS_MATRIX_ENDPOINT), {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ locations: points, metrics: ["duration"] }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { durations?: unknown }
    return Array.isArray(body.durations) ? { durations: body.durations as number[][], source: "ors" } : null
  } catch {
    return null
  }
}

function dedupe(points: [number, number][]): [number, number][] {
  const out: [number, number][] = []
  for (const point of points) {
    const last = out[out.length - 1]
    if (!last || round3(last[0]) !== round3(point[0]) || round3(last[1]) !== round3(point[1])) {
      out.push(point)
    }
  }
  return out
}

export async function routingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/shape", async (request, reply) => {
    const orgId = getOrgId(request)
    if (!orgId) return sendMissingOrg(reply)
    const roleFailure = requireRole(request, reply, ["dispatcher", "manager", "admin", "owner"])
    if (roleFailure) return roleFailure

    const parsed = parseBody(shapeQuerySchema, request.query)
    if (!parsed.ok) return sendValidationError(reply, parsed.error)
    const points = parseCoordList(parsed.data.stops)
    if (!points) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: `stops must be 2..${MAX_POINTS} "lng,lat" pairs separated by ";"`,
      })
    }
    const deduped = dedupe(points)
    if (deduped.length < 2) return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: "stops must contain at least two distinct points" })

    const key = signatureOf(deduped)
    const cached = cacheGet(shapeCache, key)
    if (cached) return reply.send(cached)

    const apiKey = process.env.ORS_API_KEY?.trim()
    if (!apiKey) {
      return reply.code(503).send({ message: "Routing is not configured (set ORS_API_KEY); the map falls back to straight-line routes" })
    }
    const result = await orsShape(deduped, apiKey)
    if (!result) return reply.code(502).send({ message: "Routing provider unavailable" })
    cacheSet(shapeCache, key, result)
    recordAuditEvent(request, {
      action: "routing.shape",
      entityType: "routing",
      entityId: key.slice(0, 120),
      metadata: { source: result.source, points: deduped.length },
    })
    return reply.send(result)
  })

  app.get("/matrix", async (request, reply) => {
    const orgId = getOrgId(request)
    if (!orgId) return sendMissingOrg(reply)
    const roleFailure = requireRole(request, reply, ["dispatcher", "manager", "admin", "owner"])
    if (roleFailure) return roleFailure

    const parsed = parseBody(matrixQuerySchema, request.query)
    if (!parsed.ok) return sendValidationError(reply, parsed.error)
    const points = parseCoordList(parsed.data.points)
    if (!points) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: `points must be 2..${MAX_POINTS} "lng,lat" pairs separated by ";"`,
      })
    }
    const deduped = dedupe(points)
    if (deduped.length < 2) return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: "points must contain at least two distinct points" })

    const key = signatureOf(deduped)
    const cached = cacheGet(matrixCache, key)
    if (cached) return reply.send(cached)

    const apiKey = process.env.ORS_API_KEY?.trim()
    if (!apiKey) {
      return reply.code(503).send({ message: "Routing is not configured (set ORS_API_KEY); travel times fall back to the estimator" })
    }
    const result = await orsMatrix(deduped, apiKey)
    if (!result) return reply.code(502).send({ message: "Routing provider unavailable" })
    cacheSet(matrixCache, key, result)
    return reply.send(result)
  })
}
