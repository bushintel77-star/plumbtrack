import type { GeoPoint } from "@/types"

import { cachedRoadMinutes } from "@/lib/roadTime"

/** Great-circle distance in kilometres. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const CITY_SPEED_KMH = 35
const FIXED_OVERHEAD_MIN = 4

/**
 * Estimated door-to-door travel minutes between two sites — city average
 * speed plus fixed pack-up/park overhead, rounded to 5-minute blocks.
 * Heuristic stand-in for the routing engine (milestone M6 supplies real
 * drive-time matrices); deterministic so tests and buffers stay stable.
 */
export function travelMinutes(a: GeoPoint, b: GeoPoint): number {
  // Real road duration when the ORS matrix has been primed for this pair —
  // same rounded 5-minute granularity, so every consumer behaves uniformly.
  const road = cachedRoadMinutes(a, b)
  if (road !== null) return road
  const km = haversineKm(a, b)
  const minutes = (km / CITY_SPEED_KMH) * 60 + FIXED_OVERHEAD_MIN
  return Math.max(5, Math.round(minutes / 5) * 5)
}
