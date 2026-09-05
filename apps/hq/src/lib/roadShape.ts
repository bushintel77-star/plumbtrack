/**
 * Road-following geometry for per-tech stop chains.
 *
 * All routing goes through the authenticated API proxy
 * (`GET /api/routing/shape`) — never from the browser directly — so the ORS
 * key (when configured) stays server-side. Without connectivity the map
 * keeps its straight-line polylines: only successful shapes are cached, and
 * a transient failure retries on the next board change.
 */

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

/** Never throws: resolves the road path for the stop chain, or null when the
 *  chain is degenerate or the routing proxy is unreachable. On a stable board
 *  the debounce never refires, so transient proxy/ORS hiccups are retried in-
 *  module (3 attempts, back-off) before the caller sees null. */
const SHAPE_ATTEMPTS = 3
const SHAPE_RETRY_MS = 2_500

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

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

  const request = (async () => {
    const { apiGet } = await import("@/lib/api")
    const stops = deduped.map(([lng, lat]) => `${lng},${lat}`).join(";")
    for (let attempt = 0; attempt < SHAPE_ATTEMPTS; attempt++) {
      try {
        const body = await apiGet<{ coordinates?: unknown }>(`/api/routing/shape?stops=${encodeURIComponent(stops)}`)
        const coords = Array.isArray(body.coordinates) && body.coordinates.length >= 2
          ? (body.coordinates as LngLat[])
          : null
        if (coords) return coords
        // A 200 without coordinates means the proxy has no provider — no
        // point retrying a configuration gap.
        return null
      } catch {
        if (attempt < SHAPE_ATTEMPTS - 1) await delay(SHAPE_RETRY_MS * (attempt + 1))
      }
    }
    return null
  })()

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
