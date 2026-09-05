"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Map, { Layer, Marker, Popup, Source, type MapRef } from "react-map-gl/maplibre"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

import { useBoardStore, useJobsList } from "@/stores/boardStore"
import type { Job } from "@/types"
import { blockLabel } from "@/lib/format"
import { statusStyleFor } from "@/lib/statusStyles"
import { cn } from "@/lib/utils"
import { fetchRoadShape, routeSignature, type LngLat } from "@/lib/roadShape"

import { readComputedTokens, personColor, resolvePalette, statusColor, type MapPalette } from "./palette"

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
 *  lead with a self-hosted Protomaps PMTiles style — set
 *  NEXT_PUBLIC_MAP_STYLE_URL to a style.json URL (e.g. a PMTiles style
 *  served from your own origin) and it is tried first for both themes. */
const SELF_HOSTED_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim()
const MAP_STYLE_CANDIDATES = {
  dark: [
    ...(SELF_HOSTED_STYLE ? [SELF_HOSTED_STYLE] : []),
    "https://tiles.openfreemap.org/styles/dark",
    "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
  ],
  light: [
    ...(SELF_HOSTED_STYLE ? [SELF_HOSTED_STYLE] : []),
    "https://tiles.openfreemap.org/styles/positron",
    "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
  ]
} as const

/** Seconds a candidate style gets to become ready before we fall through to
 *  the next source — generous enough for a cold deploy, short enough that a
 *  dead provider doesn't hold dispatch hostage. */
const STYLE_READY_TIMEOUT_MS = 12_000

const MELBOURNE = { lng: 144.96, lat: -37.82 }

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

/** Read-only hover card: identity, address, window and crew. Details live in
 *  the right-hand inspector (click the pin or a crew row) — the popup never
 *  duplicates that action, which is why it stays pointer-events: none. */
function MapJobPopup({ job }: { job: Job }) {
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
      {isUnassigned && <div className="mt-2 label-mono text-[10px] text-pending">UNASSIGNED · ASSIGN FROM THE INSPECTOR</div>}
    </div>
  )
}

interface MapLibreViewProps {
  visible: Job[]
  vanId: string
  onSelectJob: (jobId: string) => void
  /** Visit order for the selected crew member's route (Route plan panel).
   *  Routed stops render a numbered, keyboard-focusable badge marker on top
   *  of the canvas pin — the only per-pin affordance that is reachable
   *  without a pointer, since WebGL layers are invisible to the a11y tree. */
  orderedStopIds?: string[]
  /** Which job each van is currently on site at (geofence display only),
   *  keyed by technician id. Computed by the surface, which knows the day. */
  onsiteByTech?: Record<string, string | null>
}

export default function MapLibreView({ visible, vanId, onSelectJob, orderedStopIds = [], onsiteByTech = {} }: MapLibreViewProps) {
  const theme = useBoardStore(s => s.theme)
  const styleCandidates = MAP_STYLE_CANDIDATES[theme]
  const [styleIndex, setStyleIndex] = useState(0)
  const [mapError, setMapError] = useState(false)
  const [styleLoaded, setStyleLoaded] = useState(false)
  const mapRef = useRef<MapRef | null>(null)
  const technicians = useBoardStore(s => s.technicians)
  const vehicles = useBoardStore(s => s.vehicles)
  const selectedJobId = useBoardStore(s => s.selectedJobId)
  const [hoveredJobId, setHoveredJobId] = useState<string | null>(null)
  /** Road-following coordinates per stop-chain signature (straight lines until they land). */
  const [roadShapes, setRoadShapes] = useState<Record<string, LngLat[]>>({})
  const [roadShapeSources, setRoadShapeSources] = useState<Record<string, "road" | "straight-line">>({})
  const [palette, setPalette] = useState<MapPalette>(() => resolvePalette(readComputedTokens()))
  /** Job the camera last panned to — guards against re-centering on every poll. */
  const lastPannedJobRef = useRef<string | null>(null)

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

  // Job detail popups anchor ABOVE their pin; a pin near the top of the
  // viewport pushes the popup (and its "Open job details" button) off-canvas
  // where clicks land on nothing. Flip the anchor below the pin whenever the
  // projected position lacks headroom. Recomputes when the map becomes ready
  // and after every camera move — projection coordinates are viewport-live.
  const [cameraVersion, setCameraVersion] = useState(0)
  const popupAnchor: "bottom" | "top" = useMemo(() => {
    if (!hoveredLocation || !styleLoaded || !mapRef.current) return "bottom"
    try {
      const projected = mapRef.current.project([hoveredLocation.lng, hoveredLocation.lat])
      return projected.y < 240 ? "top" : "bottom"
    } catch {
      return "bottom"
    }
    // cameraVersion tracks pan/zoom so the anchor follows the live viewport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredLocation, styleLoaded, cameraVersion])

  useEffect(() => {
    if (!selectedJobId) {
      // Allow re-selecting the same job later to pan again.
      lastPannedJobRef.current = null
      return
    }
    const job = visible.find(item => item.id === selectedJobId)
    if (!job?.location) return
    // Pan the map to a freshly selected job so its pin — and the popup that
    // carries the details action — is comfortably inside the viewport. The
    // map may still be loading on the first effect run: only record the pan
    // once it has actually fired, and re-run when the map becomes ready.
    if (!mapRef.current || !styleLoaded) return
    if (lastPannedJobRef.current === selectedJobId) return
    lastPannedJobRef.current = selectedJobId
    mapRef.current.easeTo({
      center: [job.location.lng, job.location.lat],
      duration: 600,
      padding: { top: 260, bottom: 120, left: 120, right: 160 }
    })
  }, [selectedJobId, visible, styleLoaded])

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
  // Numbered stop badges for the selected crew member's route — DOM markers,
  // so they are focusable buttons and readable by assistive tech (the WebGL
  // pin layers are not). Order comes from the Route plan (travel-ordered).
  const routedStops = useMemo(
    () =>
      orderedStopIds
        .map((jobId, index) => ({
          job: visible.find(item => item.id === jobId),
          stopNumber: index + 1
        }))
        .filter((entry): entry is { job: Job; stopNumber: number } => Boolean(entry.job?.location)),
    [orderedStopIds, visible]
  )

  // Vehicle position source per tech — live shift-gated telemetry wins;
  // before the first ping, fall back to the last-known clock-in fix. The
  // route line starts here so the path visibly belongs to this van.
  const liveLocations = useBoardStore(s => s.liveLocations)
  const techOrigin = (tech: (typeof technicians)[number]): LngLat | null => {
    const vehicleId = `veh-${tech.van.toLowerCase().replace(/\s+/g, "-")}`
    const live = liveLocations[vehicleId]
    const source = live ?? tech.lastKnownLocation
    return source ? [source.lng, source.lat] : null
  }

  // One chain builder shared by the renderer and the road-shape fetcher —
  // these MUST be the same chains, or fetched geometry never matches the
  // rendered signature (the bug that kept lines permanently dashed).
  const renderChains = useMemo(
    () =>
      technicians
        .map((tech, index) => {
          // The selected crew member's line follows the travel-ordered Route
          // plan (same order as the numbered stop badges); everyone else's
          // follows board time.
          const stops = (tech.id === vanId && orderedStopIds.length >= 2
            ? orderedStopIds
                .map(id => visible.find(j => j.id === id))
                .filter((j): j is (typeof visible)[number] => Boolean(j?.location))
            : visible
                .filter(j => j.techId === tech.id && j.location)
                .sort((a, b) => a.startBlock - b.startBlock)
          ).map((j): LngLat => [j.location!.lng, j.location!.lat])
          // Anchor the line at the assigned tech's own position — the path
          // belongs to the van, not floating between stops.
          const origin = techOrigin(tech)
          const chain = origin ? [origin, ...stops] : stops
          if (chain.length < 2) return null
          return { techId: tech.id, index, chain, signature: routeSignature(chain) }
        })
        .filter(Boolean) as Array<{ techId: string; index: number; chain: LngLat[]; signature: string }>,
    // techOrigin closes over liveLocations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [technicians, visible, vanId, orderedStopIds, liveLocations]
  )

  const routes = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: renderChains.map(({ techId, index, chain, signature }) => ({
        type: "Feature" as const,
        properties: {
          techId,
          color: personColor(index, palette),
          emphasized: !vanId || vanId === techId,
          geometrySource: roadShapeSources[signature] ?? "straight-line"
        },
        geometry: { type: "LineString" as const, coordinates: roadShapes[signature] ?? chain }
      }))
    }),
    [renderChains, vanId, roadShapes, roadShapeSources, palette]
  )

  // Vehicle markers — live telemetry (shift-gated: the field app streams only
  // while a technician is clocked on, pauses on breaks, stops on log-off)
  // wins; until a live ping lands, fall back to the technician's last-known
  // clock-in fix so the map never invents a position. Live entries carry
  // heading for the symbol rotation; fallbacks rotate to a neutral -90 (north).
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
              /** On-site halo (display-only geofence, computed by the surface). */
              onsite: Boolean(onsiteByTech[tech.id]),
              color: personColor(index, palette)
            },
            geometry: {
              type: "Point" as const,
              coordinates: [source.lng, source.lat]
            }
          }
        })
        .filter(Boolean)
    }),
    [technicians, liveLocations, palette, onsiteByTech]
  )

  // Breadcrumb trail for the selected van — the store already keeps the last
  // 20 shift-gated pings per vehicle, so this renders exactly what was
  // streamed (nothing is retained or inferred beyond it).
  const liveLocationHistory = useBoardStore(s => s.liveLocationHistory)
  const selectedTech = technicians.find(tech => tech.id === vanId)
  const trail = useMemo(() => {
    if (!selectedTech) return null
    const vehicleId = `veh-${selectedTech.van.toLowerCase().replace(/\s+/g, "-")}`
    const history = liveLocationHistory[vehicleId] ?? []
    const live = liveLocations[vehicleId]
    const points: LngLat[] = [
      ...history.map(ping => [ping.lng, ping.lat] as LngLat),
      ...(live ? [[live.lng, live.lat] as LngLat] : [])
    ]
    if (points.length < 2) return null
    return {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          properties: {},
          geometry: { type: "LineString" as const, coordinates: points }
        }
      ]
    }
  }, [selectedTech, liveLocationHistory, liveLocations])
  const trailColor = useMemo(() => {
    if (!selectedTech) return palette.vehicle
    const index = technicians.findIndex(tech => tech.id === selectedTech.id)
    return personColor(index >= 0 ? index : 0, palette)
  }, [selectedTech, technicians, palette])

  // Road-following upgrade for the dashed polylines: debounced per board
  // change, cached by stop-chain signature, silent no-op offline. Fetches for
  // EXACTLY the rendered chains (renderChains) — a different chain here would
  // cache geometry under a signature the renderer never looks up.
  const chainsSignature = renderChains.map(c => c.signature).join("||")
  useEffect(() => {
    if (renderChains.length === 0) return
    const timer = setTimeout(() => {
      void Promise.all(
        renderChains.map(async ({ chain, signature }) => {
          const coords = await fetchRoadShape(chain)
          return [signature, coords] as const
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
      ref={mapRef}
      key={`${theme}-${styleIndex}`}
      mapLib={maplibregl}
      initialViewState={{ longitude: MELBOURNE.lng, latitude: MELBOURNE.lat, zoom: 10.5 }}
      style={{ width: "100%", height: "100%" }}
      mapStyle={styleCandidates[styleIndex]}
      onLoad={() => setStyleLoaded(true)}
      onMoveEnd={() => setCameraVersion(version => version + 1)}
      onError={(event: { error?: unknown }) => {
        if (!isFatalMapError(event)) return
        // A fatal style failure on the current source: fall through to the
        // next candidate, or blank immediately once every source is spent.
        if (styleIndex + 1 < styleCandidates.length) setStyleIndex(index => index + 1)
        else setMapError(true)
      }}
    >
      {hoveredJob && hoveredLocation && (
        <Popup
          longitude={hoveredLocation.lng}
          latitude={hoveredLocation.lat}
          anchor={popupAnchor}
          closeButton={false}
          closeOnClick={false}
          offset={14}
          className="map-job-popup"
          onClose={() => setHoveredJobId(null)}
        >
          <MapJobPopup job={hoveredJob} />
        </Popup>
      )}

      {/* Numbered route badges (DOM, focusable): stop order for the selected
          crew member, click/Enter opens the job. Screen readers announce each
          stop — the canvas pin layers below are invisible to the a11y tree. */}
      {routedStops.map(({ job, stopNumber }) => (
        <Marker
          key={`stop-${job.id}`}
          longitude={job.location!.lng}
          latitude={job.location!.lat}
          anchor="center"
          offset={[14, -14]}
        >
          <button
            type="button"
            aria-label={`Stop ${stopNumber}: ${job.title}`}
            title={`Stop ${stopNumber} · ${blockLabel(job.startBlock)}`}
            onClick={() => {
              onSelectJob(job.id)
              window.dispatchEvent(new CustomEvent("hq-map-focus-job", { detail: job.id }))
            }}
            className="tnum flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border-2 border-line bg-chrome-600 text-[10px] font-black text-on-accent shadow-md hover:bg-chrome-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chrome-200"
          >
            {stopNumber}
          </button>
        </Marker>
      ))}

      <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-md border border-line bg-void-95/90 px-2 py-1 label-mono text-[10px] text-ink-mid">
        Route lines: solid = road-routed · dashed = straight-line fallback · faint dashed = recent van path
      </div>
      <Source id="job-routes" type="geojson" data={routes}>
        {/* Selected-van route casing: a wider, softer underlay so the active
            route reads clearly over the basemap without raising a new color
            — same token-derived stroke, just wider and translucent. Static
            paint only: line-dasharray data expressions are the least-portable
            corner of the style spec, so road/fallback is split by filter. */}
        <Layer
          id="route-casing"
          type="line"
          paint={{
            "line-color": palette.vehicle,
            "line-width": ["case", ["boolean", ["get", "emphasized"], false], 8, 0],
            "line-opacity": ["case", ["boolean", ["get", "emphasized"], false], 0.18, 0]
          }}
        />
        <Layer
          id="route-lines-road"
          type="line"
          filter={["==", ["get", "geometrySource"], "road"]}
          paint={{
            "line-color": ["get", "color"],
            "line-width": ["case", ["boolean", ["get", "emphasized"], false], 3, 1.5],
            "line-opacity": ["case", ["boolean", ["get", "emphasized"], false], 0.9, 0.2]
          }}
        />
        <Layer
          id="route-lines-fallback"
          type="line"
          filter={["!=", ["get", "geometrySource"], "road"]}
          paint={{
            "line-color": ["get", "color"],
            "line-width": ["case", ["boolean", ["get", "emphasized"], false], 3, 1.5],
            "line-opacity": ["case", ["boolean", ["get", "emphasized"], false], 0.9, 0.2],
            "line-dasharray": [2, 1.5]
          }}
        />
      </Source>

      {/* Job drop pins — real DOM markers: teardrop shape in the status
          colour, hover shows the read-only card, click selects the job into
          the inspector, and each pin is a focusable button with a full
          accessible label (WebGL layers can offer none of this). */}
      {visible
        .filter(job => job.location)
        .map(job => {
          const isSelected = selectedJobId === job.id
          const tone = statusColor(job, palette)
          const { label } = statusStyleFor(job)
          return (
            <Marker
              key={`pin-${job.id}`}
              longitude={job.location!.lng}
              latitude={job.location!.lat}
              anchor="bottom"
              style={{ zIndex: isSelected ? 20 : 1 }}
            >
              <button
                type="button"
                data-testid={`map-pin-${job.id}`}
                data-status={job.status}
                aria-label={`${label}: ${job.title}, ${job.address}`}
                title={`${job.title} — ${label}`}
                className={cn("jb-pin", isSelected && "is-selected")}
                onMouseEnter={() => setHoveredJobId(job.id)}
                onMouseLeave={() => setHoveredJobId(null)}
                onFocus={() => setHoveredJobId(job.id)}
                onClick={event => {
                  event.stopPropagation()
                  onSelectJob(job.id)
                  window.dispatchEvent(new CustomEvent("hq-map-focus-job", { detail: job.id }))
                }}
              >
                <svg width="26" height="34" viewBox="0 0 24 32" aria-hidden="true">
                  <path
                    d="M12 0C5.373 0 0 5.373 0 12c0 8.5 12 20 12 20s12-11.5 12-20C24 5.373 18.627 0 12 0z"
                    fill={tone}
                    stroke="var(--chassis-void)"
                    strokeWidth="1.5"
                  />
                  <circle cx="12" cy="12" r="4.5" fill="var(--chassis-void)" />
                </svg>
              </button>
            </Marker>
          )
        })}

      {/* Vehicle markers: live shift-gated telemetry (field app streams only
      <Source id="vehicles" type="geojson" data={vehicleMarks}>
        <Layer
          id="vehicle-onsite-halo"
          type="circle"
          filter={["==", ["get", "onsite"], true]}
          paint={{
            "circle-radius": 18,
            "circle-color": palette.active,
            "circle-opacity": 0.22,
            "circle-blur": 0.8
          }}
        />
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

      {/* Recent path of the selected van: exactly the shift-gated pings the
          store has seen (last 20), faint and dashed. */}
      {trail && (
        <Source id="van-trail" type="geojson" data={trail}>
          <Layer
            id="van-trail-line"
            type="line"
            paint={{
              "line-color": trailColor,
              "line-width": 2,
              "line-opacity": 0.35,
              "line-dasharray": [1, 2]
            }}
          />
        </Source>
      )}

    </Map>
  )
}
