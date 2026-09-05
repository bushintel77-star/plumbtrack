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

/** HeiGIT/OpenRouteService endpoints. Per the ask.openrouteservice.org
 *  announcement, api.openrouteservice.org was deprecated (2026-04-28) and
 *  shut off (2026-08-24); the service moved to api.heigit.org with a
 *  service-name path prefix and unchanged keys, quotas and payloads. */
const ORS_SHAPE_ENDPOINT = "https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson"
const ORS_MATRIX_ENDPOINT = "https://api.heigit.org/openrouteservice/v2/matrix/driving-car"

const REQUEST_TIMEOUT_MS = 8_000
const MAX_POINTS = 25
const CACHE_MAX_ENTRIES = 256

/** Field roles may geocode/reverse-geocode: technicians create jobs and
 *  clock in from the field, same trust class as time entries. */
const FIELD_ROLES = ["technician", "dispatcher", "manager", "admin", "owner"] as const

/** Without a key there is nothing to call — helpers skip silently so tests
 *  and unconfigured deployments never touch the network. */
function orsKey(): string | null {
  const key = process.env.ORS_API_KEY?.trim()
  return key ? key : null
}

/** Forward-geocode an address string via Pelias, biased to the service area.
 *  Best-effort: returns null on any failure (or when no key is configured) so
 *  callers never block job creation on the provider. */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const key = orsKey()
  if (!key) return null
  try {
    const url = safeUpstreamUrl(new URL("https://api.heigit.org"))
    url.pathname = "/pelias/v1/search"
    url.search = new URLSearchParams({
      text: address,
      "focus.point.lat": "-37.82",
      "focus.point.lon": "144.98",
    }).toString()
    const res = await fetch(url, {
      headers: { Authorization: key },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { features?: Array<{ geometry?: { coordinates?: unknown } }> }
    const coords = body.features?.[0]?.geometry?.coordinates
    if (!Array.isArray(coords) || coords.length < 2) return null
    const [lng, lat] = coords as [number, number]
    if (typeof lng !== "number" || typeof lat !== "number") return null
    return { lat, lng }
  } catch {
    return null
  }
}

/** Reverse-geocode a GPS fix into a street address. Best-effort, key-gated. */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = orsKey()
  if (!key) return null
  try {
    const url = safeUpstreamUrl(new URL("https://api.heigit.org"))
    url.pathname = "/pelias/v1/reverse"
    url.search = new URLSearchParams({ "point.lat": String(lat), "point.lon": String(lng) }).toString()
    const res = await fetch(url, {
      headers: { Authorization: key },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { features?: Array<{ properties?: { label?: unknown } }> }
    const label = body.features?.[0]?.properties?.label
    return typeof label === "string" ? label : null
  } catch {
    return null
  }
}

/** The only host this proxy may ever talk to. Anything else — including
 *  loopback/private addresses smuggled through configuration — is refused
 *  before a socket opens. */
const ALLOWED_UPSTREAM_HOSTS = new Set(["api.heigit.org"])

/** SSRF guard: upstream request URLs are constants; this re-asserts https
 *  and the host allowlist before any fetch. Throws on anything else. */
function safeUpstreamUrl(base: string | URL): URL {
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
const snapCache = new Map<string, { snapped: [number, number][] }>()
const isochroneCache = new Map<string, { geojson: unknown }>()

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

  // ── Geocoding (Pelias) ───────────────────────────────────────────────────
  // Forward: job creation stores coordinates from the address the dispatcher
  // typed. Reverse: clock-in GPS becomes a street address. Field roles may
  // call both — technicians create jobs and clock in from the field.

  const geocodeQuerySchema = z.object({ text: z.string().trim().min(3).max(200) })
  const reverseQuerySchema = z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
  })

  async function peliasGet(path: string, query: URLSearchParams): Promise<{ features?: Array<{ geometry?: { coordinates?: unknown }; properties?: Record<string, unknown> }> } | null> {
    const url = safeUpstreamUrl(new URL("https://api.heigit.org"))
    url.pathname = path
    url.search = query.toString()
    const res = await fetch(url, {
      headers: { Authorization: process.env.ORS_API_KEY?.trim() ?? "" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) return null
    return (await res.json()) as { features?: Array<{ geometry?: { coordinates?: unknown }; properties?: Record<string, unknown> }> }
  }

  app.get("/geocode", async (request, reply) => {
    const orgId = getOrgId(request)
    if (!orgId) return sendMissingOrg(reply)
    const roleFailure = requireRole(request, reply, FIELD_ROLES)
    if (roleFailure) return roleFailure

    const parsed = parseBody(geocodeQuerySchema, request.query)
    if (!parsed.ok) return sendValidationError(reply, parsed.error)
    if (!process.env.ORS_API_KEY?.trim()) {
      return reply.code(503).send({ message: "Routing is not configured (set ORS_API_KEY)" })
    }

    const query = new URLSearchParams({ text: parsed.data.text, "focus.point.lat": "-37.82", "focus.point.lon": "144.98" })
    const body = await peliasGet("/pelias/v1/search", query)
    if (!body) return reply.code(502).send({ message: "Geocoding provider unavailable" })
    const features = body.features ?? []
    return reply.send({
      results: features.slice(0, 5).map(f => ({
        label: (f.properties?.label as string) ?? (f.properties?.name as string) ?? "Unknown",
        lng: Array.isArray(f.geometry?.coordinates) ? f.geometry.coordinates[0] : null,
        lat: Array.isArray(f.geometry?.coordinates) ? f.geometry.coordinates[1] : null,
      })),
    })
  })

  app.get("/reverse", async (request, reply) => {
    const orgId = getOrgId(request)
    if (!orgId) return sendMissingOrg(reply)
    const roleFailure = requireRole(request, reply, FIELD_ROLES)
    if (roleFailure) return roleFailure

    const parsed = parseBody(reverseQuerySchema, request.query)
    if (!parsed.ok) return sendValidationError(reply, parsed.error)
    if (!process.env.ORS_API_KEY?.trim()) {
      return reply.code(503).send({ message: "Routing is not configured (set ORS_API_KEY)" })
    }

    const query = new URLSearchParams({
      "point.lat": String(parsed.data.lat),
      "point.lon": String(parsed.data.lng),
    })
    const body = await peliasGet("/pelias/v1/reverse", query)
    const first = body?.features?.[0]
    return reply.send({
      label: (first?.properties?.label as string) ?? null,
    })
  })

  // ── Isochrones ───────────────────────────────────────────────────────────
  // Reachability shells: "which vans can drive to this job in N minutes".
  // Display layer for the map — one call per dispatcher view, cached.

  const isochroneQuerySchema = z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    /** Comma-separated minute ranges, e.g. "10,20,30". */
    range: z.string().trim().regex(/^\d{1,3}(,\d{1,3}){0,2}$/),
  })

  const isochroneCache = new Map<string, { geojson: unknown }>()

  app.get("/isochrones", async (request, reply) => {
    const orgId = getOrgId(request)
    if (!orgId) return sendMissingOrg(reply)
    const roleFailure = requireRole(request, reply, ["dispatcher", "manager", "admin", "owner"])
    if (roleFailure) return roleFailure

    const parsed = parseBody(isochroneQuerySchema, request.query)
    if (!parsed.ok) return sendValidationError(reply, parsed.error)
    const ranges = parsed.data.range.split(",").map(Number)
    const key = `iso:${parsed.data.lat},${parsed.data.lng}:${parsed.data.range}`
    const cached = cacheGet(isochroneCache, key)
    if (cached) return reply.send(cached)

    const apiKey = process.env.ORS_API_KEY?.trim()
    if (!apiKey) {
      return reply.code(503).send({ message: "Routing is not configured (set ORS_API_KEY)" })
    }
    try {
      const url = safeUpstreamUrl(new URL("https://api.heigit.org"))
      url.pathname = "/openrouteservice/v2/isochrones/driving-car"
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          locations: [[parsed.data.lng, parsed.data.lat]],
          range: ranges.map(minutes => minutes * 60),
          range_type: "time",
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!res.ok) return reply.code(502).send({ message: "Routing provider unavailable" })
      const geojson = await res.json()
      const payload = { geojson }
      cacheSet(isochroneCache, key, payload)
      return reply.send(payload)
    } catch {
      return reply.code(502).send({ message: "Routing provider unavailable" })
    }
  })

  // ── Snap ─────────────────────────────────────────────────────────────────
  // GPS breadcrumbs → nearest road edge, so van trails read as streets.

  app.get("/snap", async (request, reply) => {
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

    const key = signatureOf(points)
    const cached = cacheGet(snapCache, key)
    if (cached) return reply.send(cached)

    const apiKey = process.env.ORS_API_KEY?.trim()
    if (!apiKey) {
      return reply.code(503).send({ message: "Routing is not configured (set ORS_API_KEY)" })
    }
    try {
      const url = safeUpstreamUrl(new URL("https://api.heigit.org"))
      url.pathname = "/openrouteservice/v2/snap/driving-car"
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ locations: points, radius: [300] }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!res.ok) return reply.code(502).send({ message: "Routing provider unavailable" })
      const body = (await res.json()) as { locations?: Array<{ location?: unknown }> }
      const snapped = (body.locations ?? [])
        .map(l => (Array.isArray(l.location) ? l.location : null))
        .filter((l): l is [number, number] => Array.isArray(l) && l.length === 2)
      const payload = { snapped }
      cacheSet(snapCache, key, payload)
      return reply.send(payload)
    } catch {
      return reply.code(502).send({ message: "Routing provider unavailable" })
    }
  })

  // ── Fleet optimization (VROOM) ───────────────────────────────────────────
  // Multi-vehicle route solving: jobs + vehicles in, per-vehicle stop
  // sequences (with arrival times) out. The HQ client maps arrivals onto
  // board blocks and applies through the existing assignment pipeline.

  const optimizeBodySchema = z.object({
    jobs: z.array(z.object({
      id: z.union([z.string(), z.number()]),
      location: coordSchema,
      /** On-site duration in seconds (spanBlocks × 30 × 60). */
      service: z.coerce.number().int().min(0).max(4 * 3600).optional(),
      skills: z.array(z.number()).max(8).optional(),
      priority: z.coerce.number().int().min(0).max(100).optional(),
    })).min(1).max(60),
    vehicles: z.array(z.object({
      id: z.union([z.string(), z.number()]),
      start: coordSchema,
      skills: z.array(z.number()).max(8).optional(),
      /** Shift window in seconds from midnight, e.g. [28800, 64800]. */
      time_window: z.tuple([z.coerce.number().int().min(0), z.coerce.number().int().max(86400)]).optional(),
    })).min(1).max(12),
  })

  app.post("/optimize", async (request, reply) => {
    const orgId = getOrgId(request)
    if (!orgId) return sendMissingOrg(reply)
    const roleFailure = requireRole(request, reply, ["dispatcher", "manager", "admin", "owner"])
    if (roleFailure) return roleFailure

    const parsed = parseBody(optimizeBodySchema, request.body)
    if (!parsed.ok) return sendValidationError(reply, parsed.error)
    const apiKey = process.env.ORS_API_KEY?.trim()
    if (!apiKey) {
      return reply.code(503).send({ message: "Routing is not configured (set ORS_API_KEY)" })
    }

    try {
      const url = safeUpstreamUrl(new URL("https://api.heigit.org"))
      url.pathname = "/vroom/v0"
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
        signal: AbortSignal.timeout(30_000),
      })
      if (!res.ok) return reply.code(502).send({ message: "Optimization provider unavailable" })
      return reply.send(await res.json())
    } catch {
      return reply.code(502).send({ message: "Optimization provider unavailable" })
    }
  })
}
