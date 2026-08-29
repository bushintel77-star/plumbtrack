import type { JSX } from "react"
import { useMemo } from "react"
import { Image, Pressable, View } from "react-native"
import { useRouter } from "expo-router"

import { useFieldState } from "@/state/store"
import type { Job } from "@/types"

/**
 * MAP tab (mockup fusion) — today's sites as a glanceable OSM raster
 * mini-map: keyless OpenStreetMap tiles centred on the jobs' centroid,
 * pins coloured by the status law (red emergency / teal billing / amber
 * scheduled / green done). This is the honest lightweight v1 — the full
 * vector map (MapLibre, live board) is the native-build follow-up. Jobs
 * without coordinates (the API doesn't geocode yet) fall to the list
 * below instead of silently vanishing.
 */

const ZOOM = 14
const TILE_SIZE = 256
const GRID_W = 2 // tiles across
const GRID_H = 3 // tiles down

function lngToTileX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * 2 ** zoom
}

function latToTileY(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom
}

function pinColor(job: Job): string {
  if (job.jobType === "emergency" && job.status !== "completed") return "#d7263d"
  if (job.status === "in_progress") return "#14b8a6"
  if (job.status === "scheduled") return "#f2b705"
  return "#1faa59"
}

export default function MapScreen(): JSX.Element {
  const router = useRouter()
  const jobs = useFieldState(state => state.jobs)

  const pinned = useMemo(() => jobs.filter(job => job.location), [jobs])
  const unpinned = useMemo(() => jobs.filter(job => !job.location), [jobs])

  const centre = useMemo(() => {
    if (pinned.length === 0) return null
    const lat = pinned.reduce((sum, job) => sum + job.location!.lat, 0) / pinned.length
    const lng = pinned.reduce((sum, job) => sum + job.location!.lng, 0) / pinned.length
    return { lat, lng }
  }, [pinned])

  // The map origin (top-left tile + fractional offset) from the centroid.
  const origin = useMemo(() => {
    if (!centre) return null
    const cx = lngToTileX(centre.lng, ZOOM)
    const cy = latToTileY(centre.lat, ZOOM)
    return { x0: Math.floor(cx) - Math.floor(GRID_W / 2), y0: Math.floor(cy) - Math.floor(GRID_H / 2), cx, cy }
  }, [centre])

  const mapPixelWidth = GRID_W * TILE_SIZE
  const mapPixelHeight = GRID_H * TILE_SIZE

  const positionOf = (job: Job): { left: number; top: number } | null => {
    if (!origin || !job.location) return null
    const left = (lngToTileX(job.location.lng, ZOOM) - origin.x0) * TILE_SIZE
    const top = (latToTileY(job.location.lat, ZOOM) - origin.y0) * TILE_SIZE
    if (left < 0 || top < 0 || left > mapPixelWidth || top > mapPixelHeight) return null
    return { left: left - 11, top: top - 30 } // pin anchor: tip at the point
  }

  return (
    <View className="flex-1 bg-background px-4 pt-4">
      <View className="font-display text-[30px] font-bold leading-none text-ink">{"Today's Sites"}</View>
      <View className="mt-1.5 font-mono text-[12px] text-ink-muted">
        {pinned.length} OF {jobs.length} JOBS MAPPED · OSM RASTER · KEYLESS
      </View>

      {origin ? (
        <View className="mt-3 overflow-hidden rounded-xl border border-line">
          <View style={{ width: mapPixelWidth, height: mapPixelHeight }}>
            {Array.from({ length: GRID_H }, (_, ty) =>
              Array.from({ length: GRID_W }, (_, tx) => (
                <Image
                  key={`${origin.x0 + tx}-${origin.y0 + ty}`}
                  source={{ uri: `https://tile.openstreetmap.org/${ZOOM}/${origin.x0 + tx}/${origin.y0 + ty}.png` }}
                  style={{
                    position: "absolute",
                    left: tx * TILE_SIZE,
                    top: ty * TILE_SIZE,
                    width: TILE_SIZE,
                    height: TILE_SIZE,
                    opacity: 0.9
                  }}
                />
              ))
            )}
            {pinned.map(job => {
              const position = positionOf(job)
              if (!position) return null
              return (
                <Pressable
                  key={job.id}
                  onPress={() => router.push(`/job/${job.id}`)}
                  accessibilityLabel={`Open ${job.client} job`}
                  style={{ position: "absolute", left: position.left, top: position.top }}
                  className="items-center"
                >
                  <View
                    className="h-[22px] w-[22px] items-center justify-center rounded-full border-2"
                    style={{ borderColor: pinColor(job), backgroundColor: "#0a0e13" }}
                  >
                    <View className="h-2 w-2 rounded-full" style={{ backgroundColor: pinColor(job) }} />
                  </View>
                  <View
                    style={{
                      width: 0,
                      height: 0,
                      borderLeftWidth: 5,
                      borderRightWidth: 5,
                      borderTopWidth: 7,
                      borderLeftColor: "transparent",
                      borderRightColor: "transparent",
                      borderTopColor: pinColor(job)
                    }}
                  />
                </Pressable>
              )
            })}
          </View>
        </View>
      ) : (
        <View className="mt-6 items-center rounded-xl border border-dashed border-line-strong p-6">
          <View className="font-display text-[20px] font-bold text-ink">No mapped sites</View>
          <View className="mt-1 text-center text-[13px] text-ink-muted">
            {
              "Today's jobs carry no coordinates yet — the API doesn't geocode addresses."
            }
          </View>
        </View>
      )}

      {unpinned.length > 0 && (
        <View className="mt-4">
          <View className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted">
            NOT YET MAPPED
          </View>
          {unpinned.map(job => (
            <Pressable
              key={job.id}
              onPress={() => router.push(`/job/${job.id}`)}
              className="mb-1.5 flex-row items-center justify-between rounded-lg border border-line bg-surface px-3 py-2.5"
            >
              <View className="min-w-0 flex-1">
                <View className="text-[14px] font-semibold text-ink">{job.client}</View>
                <View className="truncate text-[12px] text-ink-muted">{job.address}</View>
              </View>
              <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: pinColor(job) }} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}
