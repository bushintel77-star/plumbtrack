import type { GeoPoint } from "@/types"

/**
 * Road-time layer over the straight-line estimator.
 *
 * `travelMinutes()` stays synchronous everywhere: it returns a cached real
 * road duration when the pair has been primed, else the heuristic. Once per
 * session `primeRoadMatrix()` batches every known site through the
 * authenticated API proxy (`GET /api/routing/matrix`) — the provider key
 * lives server-side — so suggestions, travel bands, the optimizer, live ETAs
 * and conflict checks all upgrade to true drive times without any call-site
 * changes. The proxy itself falls back to OSRM, so priming works even
 * without an ORS key; offline or on failure the estimator covers us.
 */

const round3 = (n: number) => Math.round(n * 1000) / 1000
const pairKey = (a: GeoPoint, b: GeoPoint) =>
  `${round3(a.lng)},${round3(a.lat)}|${round3(b.lng)},${round3(b.lat)}`

const roadCache = new Map<string, number>()

export function cachedRoadMinutes(a: GeoPoint, b: GeoPoint): number | null {
  return roadCache.get(pairKey(a, b)) ?? null
}

let priming: Promise<void> | null = null

/** Fire-and-forget: fills the road cache for every pair of given sites.
 * Coordinates are deduped to ~100 m; durations land in the same rounded
 * 5-minute granularity as the estimator so buffers and tests stay stable. */
export function primeRoadMatrix(points: GeoPoint[]): Promise<void> {
  if (points.length < 2) return Promise.resolve()
  if (priming) return priming

  const seen = new Set<string>()
  const locations = points.filter(p => {
    const k = `${round3(p.lng)},${round3(p.lat)}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  if (locations.length < 2) return Promise.resolve()
  // One matrix call covers the whole board; if the fleet ever exceeds the
  // provider's per-request sites, chunk here.
  priming = (async () => {
    try {
      const { apiGet } = await import("@/lib/api")
      const query = locations.map(p => `${p.lng},${p.lat}`).join(";")
      const body = await apiGet<{ durations?: unknown }>(
        `/api/routing/matrix?points=${encodeURIComponent(query)}`
      )
      const durations = body.durations
      if (!Array.isArray(durations)) return
      for (let i = 0; i < locations.length; i++) {
        for (let j = 0; j < locations.length; j++) {
          const seconds = durations?.[i]?.[j]
          if (typeof seconds === "number" && seconds >= 0) {
            roadCache.set(
              pairKey(locations[i], locations[j]),
              Math.max(1, Math.round(seconds / 60 / 5) * 5)
            )
          }
        }
      }
    } catch {
      // Offline, quota, or unauthenticated — the estimator fallback covers us.
    }
  })()
  return priming
}
