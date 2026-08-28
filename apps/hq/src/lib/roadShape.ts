/**
 * Road-following geometry for per-tech stop chains (free-stack step 3).
 *
 * Tiered exactly like roadTime: OpenRouteService directions when the free
 * API key is present, the keyless OSRM public demo server otherwise, and
 * `null` on any failure so the map keeps its straight-line polylines. Only
 * successful shapes are cached — a transient failure retries on the next
 * board change. Self-host escape hatch: any OSRM/Valhalla instance speaks
 * the same route API — swap OSRM_ENDPOINT.
 */

const ORS_ENDPOINT = "https://api.openrouteservice.org/v2/directions/driving-car/geojson"
const OSRM_ENDPOINT = "https://router.project-osrm.org/route/v1/driving"

/** [lng, lat] — MapLibre coordinate order. */
export type LngLat = [number, number]

const round3 = (n: number) => Math.round(n * 1000) / 1000

/** Stable signature for a stop chain: coordinates deduped to ~100 m. */
export function routeSignature(points: LngLat[]): string {
  return points.map(([lng, lat]) => `${round3(lng)},${round3(lat)}`).join("|")
}

const shapeCache = new Map<string, LngLat[]>()
const inflight = new Map<string, Promise<LngLat[] | null>>()

export function cachedRoadShape(points: LngLat[]): LngLat[] | null {
  return shapeCache.get(routeSignature(points)) ?? null
}

async function orsRequest(points: LngLat[], apiKey: string): Promise<LngLat[] | null> {
  const res = await fetch(ORS_ENDPOINT, {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ coordinates: points }),
    signal: AbortSignal.timeout(8000)
  })
  if (!res.ok) return null
  const coords = (await res.json())?.features?.[0]?.geometry?.coordinates
  return Array.isArray(coords) ? coords : null
}

async function osrmRequest(points: LngLat[]): Promise<LngLat[] | null> {
  const coords = points.map(([lng, lat]) => `${lng},${lat}`).join(";")
  const res = await fetch(
    `${OSRM_ENDPOINT}/${coords}?overview=full&geometries=geojson`,
    { signal: AbortSignal.timeout(8000) }
  )
  if (!res.ok) return null
  const geometry = (await res.json())?.routes?.[0]?.geometry?.coordinates
  return Array.isArray(geometry) ? geometry : null
}

/** Never throws: resolves the road path for the stop chain, or null when the
 *  chain is degenerate or the routing tier is unreachable. */
export function fetchRoadShape(points: LngLat[]): Promise<LngLat[] | null> {
  const key = routeSignature(points)
  const cached = shapeCache.get(key)
  if (cached) return Promise.resolve(cached)
  const running = inflight.get(key)
  if (running) return running

  const deduped: LngLat[] = []
  for (const point of points) {
    const last = deduped[deduped.length - 1]
    if (!last || round3(last[0]) !== round3(point[0]) || round3(last[1]) !== round3(point[1])) {
      deduped.push(point)
    }
  }
  if (deduped.length < 2) return Promise.resolve(null)

  const apiKey = process.env.NEXT_PUBLIC_ORS_API_KEY
  const request = apiKey ? orsRequest(deduped, apiKey) : osrmRequest(deduped)
  const settled = request
    .then(coords => {
      if (coords && coords.length >= 2) shapeCache.set(key, coords)
      return coords ?? null
    })
    .catch(() => null)
    .finally(() => {
      inflight.delete(key)
    })
  inflight.set(key, settled)
  return settled
}
