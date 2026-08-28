"use client"

import { useEffect, useMemo, useState } from "react"
import Map, { Layer, Marker, Popup, Source, useMap, type LayerProps } from "react-map-gl/maplibre"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

import { useBoardStore, useJobsList } from "@/stores/boardStore"
import type { Job } from "@/types"
import { blockLabel } from "@/lib/format"

/**
 * Live WebGL map (research §Phase 3): MapLibre vector tiles, GeoJSON layers
 * for job pins / dashed per-tech route polylines, and a symbol layer whose
 * vehicle icon rotates with the streamed `heading`. MapLibre interpolates
 * between coordinate updates, so throttled telemetry pings produce smooth
 * movement along the street network.
 */

const PERSON_COLORS = ["#c27878", "#7a9e7e", "#b08d57", "#6b7d8d"]

/** Keyless, unlimited basemaps (OpenFreeMap) keyed to the active colourway.
 * Free-tier fallback if OFM is ever unavailable: CARTO dark-matter / positron
 * (basemaps.cartocdn.com). Long-term: self-hosted Protomaps PMTiles. */
const MAP_STYLES = {
  dark: "https://tiles.openfreemap.org/styles/dark",
  light: "https://tiles.openfreemap.org/styles/positron"
} as const
const MELBOURNE = { lng: 144.96, lat: -37.82 }

function statusColor(job: Job): string {
  // Colour contract: cobalt = live/interactive work, red = emergency,
  // pale = complete, neutral = scheduled/queued. Highlight ring (hover or
  // selection) is painted separately so no status colour doubles as it.
  if (job.status === "active") return "#2563eb"
  if (job.status === "complete") return "#cbd5e1"
  if (job.priority === "emergency") return "#ff3b30"
  return "#8fa3bf"
}

function MapJobPopup({ job, onOpen }: { job: Job; onOpen: (jobId: string) => void }) {
  const tech = useBoardStore(s => s.technicians.find(item => item.id === job.techId))
  const isUnassigned = job.status === "unassigned"
  return (
    <div className="w-64 rounded-lg border border-slate-600/70 bg-slate-950/95 p-3 text-white shadow-2xl backdrop-blur-xl" data-testid={`map-popup-${job.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="label-mono text-[10px] text-blue-300">{job.id.toUpperCase()} · {job.status.replace("_", " ").toUpperCase()}</div>
          <div className="mt-1 truncate text-sm font-bold">{job.title}</div>
        </div>
        <span className="label-mono shrink-0 text-[10px] text-slate-400">{job.priority.toUpperCase()}</span>
      </div>
      <div className="mt-2 space-y-1 text-[11px] text-slate-300">
        <div className="truncate">{job.client}</div>
        <div className="truncate text-slate-400">{job.address}</div>
        <div className="label-mono tnum text-slate-400">{blockLabel(job.startBlock)} → {blockLabel(job.startBlock + job.spanBlocks)} · {job.spanBlocks * 30}M</div>
        <div className="text-slate-400">{tech ? `${tech.name} · ${tech.van}` : "Unassigned · ready to route"}</div>
      </div>
      <button type="button" onClick={() => onOpen(job.id)} className="pointer-events-auto mt-3 w-full rounded-md bg-blue-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">Open job details</button>
      {isUnassigned && <div className="mt-2 label-mono text-[10px] text-amber-300">DRAG TO ASSIGN · SMART ROUTING</div>}
    </div>
  )
}

interface MapLibreViewProps {
  visible: Job[]
  vanId: string
  onSelectJob: (jobId: string) => void
  onDragStart?: (jobId: string) => void
}

function VehicleIcon() {
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
    ctx.fillStyle = "#1e56e0"
    ctx.strokeStyle = "#ffffff"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(24, 14)
    ctx.lineTo(7, 5)
    ctx.lineTo(11, 14)
    ctx.lineTo(7, 23)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    map.addImage("hq-vehicle", {
      width: size,
      height: size,
      data: ctx.getImageData(0, 0, size, size).data
    })
  }, [map])
  return null
}

export default function MapLibreView({ visible, vanId, onSelectJob }: MapLibreViewProps) {
  const theme = useBoardStore(s => s.theme)
  const technicians = useBoardStore(s => s.technicians)
  const vehicles = useBoardStore(s => s.vehicles)
  const liveLocations = useBoardStore(s => s.liveLocations)
  const liveLocationHistory = useBoardStore(s => s.liveLocationHistory)
  const selectedJobId = useBoardStore(s => s.selectedJobId)
  const [hoveredJobId, setHoveredJobId] = useState<string | null>(null)
  const hoveredJob = visible.find(job => job.id === hoveredJobId)
  const hoveredLocation = hoveredJob?.location

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
  const unassigned = visible.filter(job => job.status === "unassigned")

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
            color: statusColor(job),
            highlighted: hoveredJobId === job.id || selectedJobId === job.id,
            draggable: job.status === "unassigned"
          },
          geometry: {
            type: "Point" as const,
            coordinates: [job.location!.lng, job.location!.lat]
          }
        }))
    }),
    [visible, hoveredJobId, selectedJobId]
  )

  const routes = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: technicians
        .map((tech, index) => {
          const stops = visible
            .filter(j => j.techId === tech.id && j.location)
            .sort((a, b) => a.startBlock - b.startBlock)
            .map(j => [j.location!.lng, j.location!.lat])
          if (stops.length < 2) return null
          return {
            type: "Feature" as const,
            properties: {
              techId: tech.id,
              color: PERSON_COLORS[index % 4],
              emphasized: !vanId || vanId === tech.id
            },
            geometry: { type: "LineString" as const, coordinates: stops }
          }
        })
        .filter(Boolean)
    }),
    [technicians, visible, vanId]
  )

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
        "circle-stroke-color": ["case", ["boolean", ["get", "highlighted"], false], "#ffffff", "#071022"]
      }
    }
    return [base]
  }, [])

  return (
    <Map
      mapLib={maplibregl}
      initialViewState={{ longitude: MELBOURNE.lng, latitude: MELBOURNE.lat, zoom: 10.5 }}
      style={{ width: "100%", height: "100%" }}
      mapStyle={MAP_STYLES[theme]}
      interactiveLayerIds={["job-pins"]}
      onMouseMove={event => {
        const feature = event.features?.find(f => f.properties?.jobId)
        if (feature?.properties?.jobId) setHoveredJobId(String(feature.properties.jobId))
      }}
      // react-map-gl synthesizes `mouseleave` when the cursor leaves an
      // interactive FEATURE — that would kill the hover card the instant the
      // pin is crossed. `onMouseOut` is the real canvas-exit event.
      onMouseOut={() => setHoveredJobId(null)}
      onClick={event => {
        const feature = event.features?.find(f => f.properties?.jobId)
        if (feature?.properties?.jobId) onSelectJob(String(feature.properties.jobId))
      }}
    >
      <VehicleIcon />
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
        <Layer id="breadcrumb-lines" type="line" paint={{ "line-color": "#60a5fa", "line-width": 2, "line-opacity": 0.35 }} />
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
