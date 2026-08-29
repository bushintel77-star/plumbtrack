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
 * for job pins / dashed per-tech route polylines, and a symbol layer whose
 * vehicle icon rotates with the streamed `heading`. MapLibre interpolates
 * between coordinate updates, so throttled telemetry pings produce smooth
 * movement along the street network. Route polylines render straight-line
 * immediately, then upgrade to road-following geometry once the free routing
 * tier (ORS keyed / OSRM keyless) answers — offline the heuristic stays.
 * Paint colors come from the Tier-1 tokens via the palette bridge (WebGL
 * cannot resolve CSS vars); DOM chrome uses the token utilities directly.
 */

/** Keyless, unlimited basemaps (OpenFreeMap) keyed to the active colourway.
 * Free-tier fallback if OFM is ever unavailable: CARTO dark-matter / positron
 * (basemaps.cartocdn.com). Long-term: self-hosted Protomaps PMTiles. */
const MAP_STYLES = {
  dark: "https://tiles.openfreemap.org/styles/dark",
  light: "https://tiles.openfreemap.org/styles/positron"
} as const

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

function VehicleIcon({ fill, stroke }: { fill: string; stroke: string }) {
  const { current: map } = useMap()
  useEffect(() => {
    if (!map || map.hasImage("hq-vehicle")) return
    const size = 28
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    // Forward-pointing triangle (bearing 0 = east, matching icon-rotate).
    ctx.fillStyle = fill
    ctx.strokeStyle = stroke
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(24, 14)
    ctx.lineTo(7, 5)
    ctx.lineTo(11, 14)
    ctx.lineTo(7, 23)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    const data = ctx.getImageData(0, 0, size, size)
    if (map.hasImage("hq-vehicle")) map.updateImage("hq-vehicle", data)
    else map.addImage("hq-vehicle", { width: size, height: size, data: data.data })
  }, [map, fill, stroke])
  return null
}

export default function MapLibreView({ visible, vanId, onSelectJob }: MapLibreViewProps) {
  const theme = useBoardStore(s => s.theme)
  const [mapError, setMapError] = useState(false)
  const technicians = useBoardStore(s => s.technicians)
  const vehicles = useBoardStore(s => s.vehicles)
  const liveLocations = useBoardStore(s => s.liveLocations)
  const liveLocationHistory = useBoardStore(s => s.liveLocationHistory)
  const selectedJobId = useBoardStore(s => s.selectedJobId)
  const [hoveredJobId, setHoveredJobId] = useState<string | null>(null)
  /** Road-following coordinates per stop-chain signature (straight lines until they land). */
  const [roadShapes, setRoadShapes] = useState<Record<string, LngLat[]>>({})
  const [palette, setPalette] = useState<MapPalette>(() => resolvePalette(readComputedTokens()))

  // WebGL paints need concrete colors, so the palette re-reads the Tier-1
  // tokens after the theme class lands on <html> — one rAF past the toggle.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setPalette(resolvePalette(readComputedTokens())))
    return () => cancelAnimationFrame(frame)
  }, [theme])
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
              emphasized: !vanId || vanId === tech.id
            },
            geometry: { type: "LineString" as const, coordinates: roadShapes[routeSignature(stops)] ?? stops }
          }
        })
        .filter(Boolean)
    }),
    [technicians, visible, vanId, roadShapes, palette]
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
          return coords ? [routeSignature(chain.stops), coords] as const : null
        })
      ).then(landed => {
        const fresh = landed.filter(
          (entry): entry is readonly [string, LngLat[]] => entry !== null
        )
        if (fresh.length === 0) return
        setRoadShapes(prev => {
          let changed = false
          const next = { ...prev }
          for (const [signature, coords] of fresh) {
            if (next[signature] !== coords) {
              next[signature] = coords
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

  const breadcrumbs = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: vehicles.map(vehicle => {
        const points = (liveLocationHistory[vehicle.id] ?? []).map(ping => [ping.lng, ping.lat])
        if (points.length < 2) return null
        return { type: "Feature" as const, properties: { vehicleId: vehicle.id }, geometry: { type: "LineString" as const, coordinates: points } }
      }).filter(Boolean)
    }),
    [vehicles, liveLocationHistory]
  )

  const fleet = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: vehicles
        .map(vehicle => {
          const ping = liveLocations[vehicle.id]
          if (!ping) return null
          return {
            type: "Feature" as const,
            properties: {
              vehicleId: vehicle.id,
              heading: ping.heading,
              speed: ping.speed
            },
            geometry: { type: "Point" as const, coordinates: [ping.lng, ping.lat] }
          }
        })
        .filter(Boolean)
    }),
    [vehicles, liveLocations]
  )

  const pinLayers: LayerProps[] = useMemo(() => {
    const base: LayerProps = {
      id: "job-pins",
      type: "circle",
      source: "job-pins",
      paint: {
        "circle-radius": ["case", ["boolean", ["get", "highlighted"], false], 9, 6],
        "circle-color": ["get", "color"],
        "circle-stroke-width": ["case", ["boolean", ["get", "highlighted"], false], 3, 2],
        "circle-stroke-color": ["case", ["boolean", ["get", "highlighted"], false], palette.highlightStroke, palette.pinStroke]
      }
    }
    return [base]
  }, [palette])

  if (mapError) {
    return (
      <div role="alert" className="flex h-full min-h-48 items-center justify-center bg-void p-6 text-center text-ink">
        <div className="max-w-sm">
          <p className="label-mono text-2xs text-pending">MAP UNAVAILABLE</p>
          <p className="mt-2 text-sm text-ink-mid">Live map tiles could not be rendered. Use the Map Jobs list to continue dispatching.</p>
          <button type="button" className="mt-4 rounded-md bg-chrome-600 px-3 py-2 text-xs font-semibold text-on-accent" onClick={() => setMapError(false)}>Retry map</button>
        </div>
      </div>
    )
  }

  return (
    <Map
      mapLib={maplibregl}
      initialViewState={{ longitude: MELBOURNE.lng, latitude: MELBOURNE.lat, zoom: 10.5 }}
      style={{ width: "100%", height: "100%" }}
      mapStyle={MAP_STYLES[theme]}
      interactiveLayerIds={["job-pins"]}
      onError={() => setMapError(true)}
      onMouseMove={(event: MapLayerMouseEvent) => {
        const feature = event.features?.find(f => f.properties?.jobId)
        if (feature?.properties?.jobId) setHoveredJobId(String(feature.properties.jobId))
      }}
      // react-map-gl synthesizes `mouseleave` when the cursor leaves an
      // interactive FEATURE — that would kill the hover card the instant the
      // pin is crossed. `onMouseOut` is the real canvas-exit event.
      onMouseOut={() => setHoveredJobId(null)}
      onClick={event => {
        const feature = event.features?.find(f => f.properties?.jobId)
        if (feature?.properties?.jobId) {
          const jobId = String(feature.properties.jobId)
          onSelectJob(jobId)
          window.dispatchEvent(new CustomEvent("hq-map-focus-job", { detail: jobId }))
        }
      }}
    >
      <VehicleIcon fill={palette.vehicle} stroke={palette.highlightStroke} />
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

      <Source id="breadcrumbs" type="geojson" data={breadcrumbs}>
        <Layer id="breadcrumb-lines" type="line" paint={{ "line-color": palette.breadcrumb, "line-width": 2, "line-opacity": 0.35 }} />
      </Source>

      <Source id="job-routes" type="geojson" data={routes}>
        <Layer
          id="route-lines"
          type="line"
          paint={{
            "line-color": ["get", "color"],
            "line-width": ["case", ["boolean", ["get", "emphasized"], false], 3, 1.5],
            "line-opacity": ["case", ["boolean", ["get", "emphasized"], false], 0.9, 0.2],
            "line-dasharray": [2, 1.5]
          }}
        />
      </Source>

      <Source id="job-pins" type="geojson" data={pins}>
        {pinLayers.map(layer => (
          <Layer key={layer.id} {...layer} />
        ))}
      </Source>

      <Source id="fleet" type="geojson" data={fleet}>
        <Layer
          id="fleet-vehicles"
          type="symbol"
          layout={{
            "icon-image": "hq-vehicle",
            "icon-size": 0.7,
            "icon-rotate": ["get", "heading"],
            "icon-rotation-alignment": "map",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true
          }}
        />
      </Source>
    </Map>
  )
}
