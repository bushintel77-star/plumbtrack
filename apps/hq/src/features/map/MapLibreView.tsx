"use client"

import { useEffect, useMemo } from "react"
import Map, { Layer, Source, useMap, type LayerProps } from "react-map-gl/maplibre"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

import { useBoardStore, useJobsList } from "@/stores/boardStore"
import type { Job } from "@/types"

/**
 * Live WebGL map (research §Phase 3): MapLibre vector tiles, GeoJSON layers
 * for job pins / dashed per-tech route polylines, and a symbol layer whose
 * vehicle icon rotates with the streamed `heading`. MapLibre interpolates
 * between coordinate updates, so throttled telemetry pings produce smooth
 * movement along the street network.
 */

const PERSON_COLORS = ["#c27878", "#7a9e7e", "#b08d57", "#6b7d8d"]

/** Free demo style — swap for the enterprise tile contract at M4. */
const MAP_STYLE = "https://demotiles.maplibre.org/style.json"
const MELBOURNE = { lng: 144.96, lat: -37.82 }

function statusColor(job: Job): string {
  if (job.status === "active") return "#2563eb"
  if (job.status === "complete") return "#cbd5e1"
  if (job.priority === "emergency") return "#ff3b30"
  return "#4e8cff"
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
  const technicians = useBoardStore(s => s.technicians)
  const vehicles = useBoardStore(s => s.vehicles)
  const liveLocations = useBoardStore(s => s.liveLocations)
  const selectedJobId = useBoardStore(s => s.selectedJobId)
  const unassigned = visible.filter(job => job.status === "unassigned")

  const pins = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: visible
        .filter(job => job.location)
        .map(job => ({
          type: "Feature" as const,
          id: job.id,            properties: {
            jobId: job.id,
            title: job.title,
            status: job.status,
            color: statusColor(job),
            draggable: job.status === "unassigned"
          },
          geometry: {
            type: "Point" as const,
            coordinates: [job.location!.lng, job.location!.lat]
          }
        }))
    }),
    [visible]
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
        "circle-radius": ["case", ["boolean", ["feature-state", "selected"], false], 9, 6],
        "circle-color": ["get", "color"],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#071022"
      }
    }
    void selectedJobId // feature-state selection lands with map interaction polish
    return [base]
  }, [selectedJobId])

  return (
    <Map
      mapLib={maplibregl}
      initialViewState={{ ...MELBOURNE, zoom: 10.5 }}
      style={{ width: "100%", height: "100%" }}
      mapStyle={MAP_STYLE}
      onClick={event => {
        const feature = event.features?.find(f => f.properties?.jobId)
        if (feature?.properties?.jobId) onSelectJob(String(feature.properties.jobId))
      }}
    >
      <VehicleIcon />

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
