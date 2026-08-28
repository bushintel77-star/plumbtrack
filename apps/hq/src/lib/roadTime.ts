import type { GeoPoint } from "@/types"

/**
 * Road-time layer over the straight-line estimator (free-stack step 2).
 *
 * `travelMinutes()` stays synchronous everywhere: it returns a cached real
 * road duration when the pair has been primed, else the heuristic. Once per
 * session `primeRoadMatrix()` batches every known site through the
 * OpenRouteService matrix (free tier, ~2k requests/day — one call covers the
 * whole board), so suggestions, travel bands, the optimizer and conflict
 * checks all upgrade to true drive times without any call-site changes.
 *
 * Without NEXT_PUBLIC_ORS_API_KEY the module is inert and the app behaves
 * exactly as before. Self-host escape hatch: Valhalla's matrix API uses the
 * same request/response shape — swap the endpoint below.
 */

const ORS_ENDPOINT = "https://api.openrouteservice.org/v2/matrix/driving-car"

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
  const apiKey = process.env.NEXT_PUBLIC_ORS_API_KEY
  if (!apiKey || points.length < 2) return Promise.resolve()
  if (priming) return priming

  const seen = new Set<string>()
  const locations = points.filter(p => {
    const k = `${round3(p.lng)},${round3(p.lat)}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  // The free matrix call comfortably takes our whole board in one request;
  // if the fleet ever exceeds ~2k sites, chunk here.
  priming = (async () => {
    try {
      const res = await fetch(ORS_ENDPOINT, {
        method: "POST",
        headers: { Authorization: apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          locations: locations.map(p => [p.lng, p.lat]),
          metrics: ["duration"]
        }),
        signal: AbortSignal.timeout(8000)
      })
      if (!res.ok) return
      const durations: number[][] = (await res.json())?.durations ?? []
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
      // Offline, quota, or CORS — the estimator fallback covers us.
    }
  })()
  return priming
}
