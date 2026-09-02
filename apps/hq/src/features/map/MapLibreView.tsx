"use client"

import { useEffect, useMemo, useState } from "react"
import Map, { Layer, Popup, Source, useMap, type LayerProps, type MapLayerMouseEvent } from "react-map-gl/maplibre"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

import { useBoardStore, useJobsList } from "@/stores/boardStore"
import type { Job } from "@/types"
import { blockLabel } from "@/lib/format"
import { fetchRoadShape, routeSignature, type LngLat } from "@/lib/roadShape"

import { readComputedTokens, resolvePalette, type MapPalette } from "./palette"

/**
 * Live WebGL map (research §Phase 3): MapLibre vector tiles, GeoJSON layers
 * for job pins and dashed per-tech route polylines. Technician location is
 * intentionally not rendered: FieldLoop permits only point-in-time capture at
 * clock-in/clock-out, never live movement or breadcrumb history. Route
 * polylines render straight-line immediately, then upgrade to road-following
 * geometry once the routing tier answers — offline the heuristic stays.
 * Paint colors come from the Tier-1 tokens via the palette bridge (WebGL
 * cannot resolve CSS vars); DOM chrome uses the token utilities directly.
 */

/** Per-colourway basemap candidates, tried in order. If a style outright
 *  fails to load (fatal), the map advances to the next source instead of
 *  blanking on a single provider. All are keyless; long-term this list can
 *  lead with a self-hosted Protomaps PMTiles style. */
const MAP_STYLE_CANDIDATES = {
  dark: [
    "https://tiles.openfreemap.org/styles/dark",
    "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
  ],
  light: [
    "https://tiles.openfreemap.org/styles/positron",
    "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
  ]
} as const

/** Seconds a candidate style gets to become ready before we fall through to
 *  the next source — generous enough for a cold deploy, short enough that a
 *  dead provider doesn't hold dispatch hostage. */
const STYLE_READY_TIMEOUT_MS = 12_000

const MELBOURNE = { lng: 144.96, lat: -37.82 }

function statusColor(job: Job, palette: MapPalette): string {
  // One precedence law shared by board, list, and map.
  if (job.priority === "emergency") return palette.urgent
  if (job.status === "delayed") return palette.pending
  if (job.status === "active") return palette.active
  if (job.status === "en_route") return palette.enRoute
  if (job.status === "complete") return palette.complete
  return palette.neutral
}

/**
 * Only genuinely-fatal map errors blank the surface. MapLibre fires `error`
 * for every failed tile/sprite while it keeps retrying those; a single 404 or
 * network abort must not collapse the whole map and lose dispatch. We treat as
 * fatal: WebGL unavailable, an explicit auth failure (401/403), or a style
 * that outright failed to load.
 */
function isFatalMapError(event: { error?: unknown }): boolean {
  const error = event.error as { message?: string; status?: number } | undefined
  const message = (error?.message ?? "").toLowerCase()
  if (message.includes("webgl")) return true
  if (error?.status === 401 || error?.status === 403) return true
  if (message.includes("style") && message.includes("failed")) return true
  return false
}

function MapJobPopup({ job, onOpen }: { job: Job; onOpen: (jobId: string) => void }) {
  const tech = useBoardStore(s => s.technicians.find(item => item.id === job.techId))
  const isUnassigned = job.status === "unassigned"
  return (
    <div className="w-64 rounded-lg border border-line bg-void-95 p-3 text-ink shadow-2xl backdrop-blur-xl" data-testid={`map-popup-${job.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="label-mono text-[10px] text-chrome-400">{job.id.toUpperCase()} · {job.status.replace("_", " ").toUpperCase()}</div>
          <div className="mt-1 truncate text-sm font-bold">{job.title}</div>
        </div>
        <span className="label-mono shrink-0 text-[10px] text-ink-mid">{job.priority.toUpperCase()}</span>
      </div>
      <div className="mt-2 space-y-1 text-[11px] text-ink">
        <div className="truncate">{job.client}</div>
        <div className="truncate text-ink-mid">{job.address}</div>
        <div className="label-mono tnum text-ink-mid">{blockLabel(job.startBlock)} → {blockLabel(job.startBlock + job.spanBlocks)} · {job.spanBlocks * 30}M</div>
        <div className="text-ink-mid">{tech ? `${tech.name} · ${tech.van}` : "Unassigned · ready to route"}</div>
      </div>
      <button type="button" onClick={() => onOpen(job.id)} className="pointer-events-auto mt-3 w-full rounded-md bg-chrome-600 px-2 py-1.5 text-xs font-semibold text-on-accent hover:bg-chrome-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chrome-200">Open job details</button>
      {isUnassigned && <div className="mt-2 label-mono text-[10px] text-pending">DRAG TO ASSIGN · SMART ROUTING</div>}
    </div>
  )
}

interface MapLibreViewProps {
  visible: Job[]
  vanId: string
  onSelectJob: (jobId: string) => void

}

export default function MapLibreView({ visible, vanId, onSelectJob }: MapLibreViewProps) {
  const theme = useBoardStore(s => s.theme)
  const styleCandidates = MAP_STYLE_CANDIDATES[theme]
  const [styleIndex, setStyleIndex] = useState(0)
  const [mapError, setMapError] = useState(false)
  const [styleLoaded, setStyleLoaded] = useState(false)
  const { current: mapRef } = useMap()
  const technicians = useBoardStore(s => s.technicians)
  const vehicles = useBoardStore(s => s.vehicles)
  const selectedJobId = useBoardStore(s => s.selectedJobId)
  const [hoveredJobId, setHoveredJobId] = useState<string | null>(null)
  /** Road-following coordinates per stop-chain signature (straight lines until they land). */
  const [roadShapes, setRoadShapes] = useState<Record<string, LngLat[]>>({})
  const [roadShapeSources, setRoadShapeSources] = useState<Record<string, "road" | "straight-line">>({})
  const [palette, setPalette] = useState<MapPalette>(() => resolvePalette(readComputedTokens()))

  // WebGL paints need concrete colors, so the palette re-reads the Tier-1
  // tokens after the theme class lands on <html> — one rAF past the toggle.
  // Theme change also swaps the candidate list, so re-arm the style attempt.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setPalette(resolvePalette(readComputedTokens())))
    setStyleIndex(0)
    setStyleLoaded(false)
    setMapError(false)
    return () => cancelAnimationFrame(frame)
  }, [theme])

  // Backstop: if the current style never becomes ready within the timeout,
  // advance to the next basemap candidate rather than blanking the surface.
  // Only after every candidate has been exhausted do we show the fallback so
  // dispatch can continue via the jobs list. Transient tile/sprite errors
  // below never trip this.
  useEffect(() => {
    if (styleLoaded || mapError) return
    const timer = window.setTimeout(() => {
      if (styleIndex + 1 < styleCandidates.length) {
        setStyleIndex(index => index + 1)
      } else {
        setMapError(true)
      }
    }, STYLE_READY_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [styleLoaded, mapError, styleIndex, styleCandidates.length])
  const hoveredJob = visible.find(job => job.id === hoveredJobId)
  const hoveredLocation = hoveredJob?.location

  useEffect(() => {
    if (!selectedJobId) return
    const job = visible.find(item => item.id === selectedJobId)
    if (!job?.location) return
    setHoveredJobId(selectedJobId)
  }, [selectedJobId, visible])

  useEffect(() => {
    const onFocusJob = (event: Event) => {
      const id = (event as CustomEvent<string>).detail
      if (visible.some(job => job.id === id)) setHoveredJobId(id)
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHoveredJobId(null)
    }
    window.addEventListener("hq-map-focus-job", onFocusJob)
    window.addEventListener("keydown", onEscape)
    return () => {
      window.removeEventListener("hq-map-focus-job", onFocusJob)
      window.removeEventListener("keydown", onEscape)
    }
  }, [visible])
  const pins = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: visible
        .filter(job => job.location)
        .map(job => ({
          type: "Feature" as const,
          id: job.id,
          properties: {
            jobId: job.id,
            title: job.title,
            status: job.status,
            color: statusColor(job, palette),
            highlighted: hoveredJobId === job.id || selectedJobId === job.id,
            draggable: job.status === "unassigned"
          },
          geometry: {
            type: "Point" as const,
            coordinates: [job.location!.lng, job.location!.lat]
          }
        }))
    }),
    [visible, hoveredJobId, selectedJobId, palette]
  )

  const routes = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: technicians
        .map((tech, index) => {
          const stops = visible
            .filter(j => j.techId === tech.id && j.location)
            .sort((a, b) => a.startBlock - b.startBlock)
            .map((j): LngLat => [j.location!.lng, j.location!.lat])
          if (stops.length < 2) return null
          return {
            type: "Feature" as const,
            properties: {
              techId: tech.id,
              color: palette.people[index % palette.people.length],
              emphasized: !vanId || vanId === tech.id,
              geometrySource: roadShapeSources[routeSignature(stops)] ?? "straight-line"
            },
            geometry: { type: "LineString" as const, coordinates: roadShapes[routeSignature(stops)] ?? stops }
          }
        })
        .filter(Boolean)
    }),
    [technicians, visible, vanId, roadShapes, roadShapeSources, palette]
  )

  // Vehicle markers — live telemetry (shift-gated: the field app streams only
  // while a technician is clocked on, pauses on breaks, stops on log-off)
  // wins; until a live ping lands, fall back to the technician's last-known
  // clock-in fix so the map never invents a position. Live entries carry
  // heading for the symbol rotation; fallbacks rotate to a neutral -90 (north).
  const liveLocations = useBoardStore(s => s.liveLocations)
  const vehicleMarks = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: technicians
        .map((tech, index) => {
          const vehicleId = `veh-${tech.van.toLowerCase().replace(/\s+/g, "-")}`
          const live = liveLocations[vehicleId]
          const source = live
            ? { lat: live.lat, lng: live.lng, heading: live.heading }
            : tech.lastKnownLocation
              ? { lat: tech.lastKnownLocation.lat, lng: tech.lastKnownLocation.lng, heading: null }
              : null
          if (!source) return null
          return {
            type: "Feature" as const,
            id: tech.id,
            properties: {
              techId: tech.id,
              vehicleId,
              van: tech.van,
              name: tech.name,
              /** MapLibre icon-rotate is clockwise degrees from north; null
               *  heading pins north so parked vans never render sideways. */
              heading: source.heading ?? -90,
              live: Boolean(live),
              presence: live?.presence ?? "on_job",
              color: palette.people[index % palette.people.length]
            },
            geometry: {
              type: "Point" as const,
              coordinates: [source.lng, source.lat]
            }
          }
        })
        .filter(Boolean)
    }),
    [technicians, liveLocations, palette]
  )

  // Road-following upgrade for the dashed polylines: debounced per board
  // change, cached by stop-chain signature, silent no-op offline.
  const routeChains = useMemo(
    () =>
      technicians
        .map(tech => ({
          techId: tech.id,
          stops: visible
            .filter(j => j.techId === tech.id && j.location)
            .sort((a, b) => a.startBlock - b.startBlock)
            .map((j): LngLat => [j.location!.lng, j.location!.lat])
        }))
        .filter(chain => chain.stops.length >= 2),
    [technicians, visible]
  )
  const chainsSignature = routeChains.map(c => `${c.techId}~${routeSignature(c.stops)}`).join("||")
  useEffect(() => {
    if (routeChains.length === 0) return
    const timer = setTimeout(() => {
      void Promise.all(
        routeChains.map(async chain => {
          const coords = await fetchRoadShape(chain.stops)
          return [routeSignature(chain.stops), coords] as const
        })
      ).then(landed => {
        setRoadShapes(prev => {
          let changed = false
          const next = { ...prev }
          for (const [signature, coords] of landed) {
            if (!coords) continue
            if (next[signature] !== coords) {
              next[signature] = coords
              changed = true
            }
          }
          return changed ? next : prev
        })
        setRoadShapeSources(prev => {
          let changed = false
          const next = { ...prev }
          for (const [signature, coords] of landed) {
            const source = coords ? "road" : "straight-line"
            if (next[signature] !== source) {
              next[signature] = source
              changed = true
            }
          }
          return changed ? next : prev
        })
      })
    }, 400)
    return () => clearTimeout(timer)
    // Signature-stable: the debounce only re-arms when a chain actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainsSignature])

  // Vehicle positions on this map are shift-gated telemetry: the field app
  // streams only while a technician is clocked on, pauses on breaks, and
  // stops on log-off. No off-shift or break-time movement is ever rendered.

  const pinLayers: LayerProps[] = useMemo(() => {
    const individual: LayerProps = {
      id: "job-pins",
      type: "circle",
      source: "job-pins",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": ["case", ["boolean", ["get", "highlighted"], false], 9, 6],
        "circle-color": ["get", "color"],
        "circle-stroke-width": ["case", ["boolean", ["get", "highlighted"], false], 3, 2],
        "circle-stroke-color": ["case", ["boolean", ["get", "highlighted"], false], palette.highlightStroke, palette.pinStroke]
      }
    }
    const cluster: LayerProps = {
      id: "job-clusters",
      type: "circle",
      source: "job-pins",
      filter: ["has", "point_count"],
      paint: {
        "circle-radius": ["step", ["get", "point_count"], 14, 10, 17, 50, 21, 200, 25],
        "circle-color": palette.active,
        "circle-stroke-width": 2,
        "circle-stroke-color": palette.highlightStroke,
        "circle-opacity": 0.9
      }
    }
    const clusterCount: LayerProps = {
      id: "job-cluster-count",
      type: "symbol",
      source: "job-pins",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-size": 11,
        "text-font": ["Open Sans Bold"],
        "text-allow-overlap": false
      },
      paint: { "text-color": palette.highlightStroke }
    }
    return [cluster, clusterCount, individual]
  }, [palette])

  if (mapError) {
    return (
      <div role="alert" className="flex h-full min-h-48 items-center justify-center bg-void p-6 text-center text-ink">
        <div className="max-w-sm">
          <p className="label-mono text-2xs text-pending">MAP UNAVAILABLE</p>
          <p className="mt-2 text-sm text-ink-mid">Live map tiles could not be rendered. Use the Map Jobs list to continue dispatching.</p>
          <button type="button" className="mt-4 rounded-md bg-chrome-600 px-3 py-2 text-xs font-semibold text-on-accent" onClick={() => { setStyleIndex(0); setStyleLoaded(false); setMapError(false) }}>Retry map</button>
        </div>
      </div>
    )
  }

  return (
    <Map
      key={`${theme}-${styleIndex}`}
      mapLib={maplibregl}
      initialViewState={{ longitude: MELBOURNE.lng, latitude: MELBOURNE.lat, zoom: 10.5 }}
      style={{ width: "100%", height: "100%" }}
      mapStyle={styleCandidates[styleIndex]}
      interactiveLayerIds={["job-pins", "job-clusters"]}
      onLoad={() => setStyleLoaded(true)}
      onError={(event: { error?: unknown }) => {
        if (!isFatalMapError(event)) return
        // A fatal style failure on the current source: fall through to the
        // next candidate, or blank immediately once every source is spent.
        if (styleIndex + 1 < styleCandidates.length) setStyleIndex(index => index + 1)
        else setMapError(true)
      }}
      onMouseMove={(event: MapLayerMouseEvent) => {
        const feature = event.features?.find(f => f.properties?.jobId)
        if (feature?.properties?.jobId) setHoveredJobId(String(feature.properties.jobId))
      }}
      // react-map-gl synthesizes `mouseleave` when the cursor leaves an
      // interactive FEATURE — that would kill the hover card the instant the
      // pin is crossed. `onMouseOut` is the real canvas-exit event.
      onMouseOut={() => setHoveredJobId(null)}
      onClick={event => {
        const feature = event.features?.[0]
        if (!feature) return
        // A clustered stop: zoom into its bounds so the underlying pins
        // separate and become clickable. Clusters carry point_count, not jobId.
        if (feature.properties?.point_count && feature.geometry?.type === "Point") {
          const coords = feature.geometry.coordinates as [number, number]
          const [lng, lat] = coords
          mapRef?.easeTo({ center: [lng, lat], zoom: Math.max((mapRef.getZoom() ?? 10.5) + 2, 12) })
          return
        }
        const jobId = feature.properties?.jobId
        if (typeof jobId === "string") {
          onSelectJob(jobId)
          window.dispatchEvent(new CustomEvent("hq-map-focus-job", { detail: jobId }))
        }
      }}
    >
      {hoveredJob && hoveredLocation && (
        <Popup
          longitude={hoveredLocation.lng}
          latitude={hoveredLocation.lat}
          anchor="bottom"
          closeButton={false}
          closeOnClick={false}
          offset={14}
          className="map-job-popup"
          onClose={() => setHoveredJobId(null)}
        >
          <MapJobPopup job={hoveredJob} onOpen={onSelectJob} />
        </Popup>
      )}

      <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-md border border-line bg-void-95/90 px-2 py-1 label-mono text-[10px] text-ink-mid">
        Route lines: solid = road-routed · dashed = straight-line fallback
      </div>
      <Source id="job-routes" type="geojson" data={routes}>
        {/* Selected-van route casing: a wider, softer underlay so the active
            route reads clearly over the basemap without raising a new color
            — same token-derived stroke, just wider and translucent. */}
        <Layer
          id="route-casing"
          type="line"
          paint={{
            "line-color": palette.vehicle,
            "line-width": ["case", ["boolean", ["get", "emphasized"], false], 8, 0],
            "line-opacity": ["case", ["boolean", ["get", "emphasized"], false], 0.18, 0],
            "line-dasharray": ["case", ["==", ["get", "geometrySource"], "road"], ["literal", [1, 0]], ["literal", [2, 1.5]]]
          }}
        />
        <Layer
          id="route-lines"
          type="line"
          paint={{
            "line-color": ["get", "color"],
            "line-width": ["case", ["boolean", ["get", "emphasized"], false], 3, 1.5],
            "line-opacity": ["case", ["boolean", ["get", "emphasized"], false], 0.9, 0.2],
            "line-dasharray": ["case", ["==", ["get", "geometrySource"], "road"], ["literal", [1, 0]], ["literal", [2, 1.5]]]
          }}
        />
      </Source>

      <Source id="job-pins" type="geojson" data={pins} cluster={true} clusterMaxZoom={12} clusterRadius={44}>
        {pinLayers.map(layer => (
          <Layer key={layer.id} {...layer} />
        ))}
      </Source>

      {/* Vehicle markers: live shift-gated telemetry (field app streams only
          while clocked on, pauses on breaks, stops on log-off) with the
          last-known clock-in fix as the fallback before the first ping.
          Ringed dot + van label + a heading arrow rotated by the streamed
          bearing; parked/fallback vans point north. */}
      <Source id="vehicles" type="geojson" data={vehicleMarks}>
        <Layer
          id="vehicle-dots"
          type="circle"
          filter={["!", ["has", "point_count"]]}
          paint={{
            "circle-radius": 7,
            "circle-color": ["get", "color"],
            "circle-stroke-width": 2.5,
            "circle-stroke-color": palette.pinStroke,
            "circle-opacity": ["case", ["==", ["get", "presence"], "on_break"], 0.35, 1],
            "circle-pitch-alignment": "map"
          }}
        />
        <Layer
          id="vehicle-heading"
          type="symbol"
          filter={["!", ["has", "point_count"]]}
          layout={{
            "text-field": "▲",
            "text-size": 12,
            "text-anchor": "center",
            "text-offset": [0, -1.15],
            "text-rotate": ["get", "heading"],
            "text-font": ["Open Sans Semibold"],
            "text-allow-overlap": true
          }}
          paint={{ "text-color": ["get", "color"], "text-halo-color": palette.pinStroke, "text-halo-width": 1 }}
        />
        <Layer
          id="vehicle-labels"
          type="symbol"
          filter={["!", ["has", "point_count"]]}
          layout={{
            "text-field": ["get", "van"],
            "text-size": 10,
            "text-anchor": "top",
            "text-offset": [0, 1.2],
            "text-font": ["Open Sans Semibold"]
          }}
          paint={{ "text-color": palette.vehicle, "text-halo-color": palette.pinStroke, "text-halo-width": 1.2 }}
        />
      </Source>

    </Map>
  )
}
