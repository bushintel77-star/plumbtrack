"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { MapPin, Navigation } from "lucide-react"

import { MapErrorBoundary } from "@/features/map/MapErrorBoundary"
import { DAY_START_MINUTES, blockLabel, formatDate } from "@/lib/format"
import { arrivedJobFor, computeRouteOrder, dispatchStatus, jobsOnDay } from "@/lib/fieldloop"
import { travelMinutes } from "@/lib/travel"
import { useBoardStore, useJobsList, type LiveLocation } from "@/stores/boardStore"
import type { GeoPoint, Job, Technician } from "@/types"

import { CrewTree } from "./CrewTree"
import { Inspector } from "./Inspector"

const MapLibreView = dynamic(() => import("@/features/map/MapLibreView"), {
  ssr: false,
  loading: () => <div className="fl-muted">Loading map…</div>
})

function vehicleKeyOf(van: string): string {
  return `veh-${van.toLowerCase().replace(/\s+/g, "-")}`
}

/** Where this van is right now: live shift-gated ping, else the last-known
 *  clock-in fix. Never an invented position. */
function currentPositionOf(
  tech: Technician,
  liveLocations: Record<string, LiveLocation>
): GeoPoint | null {
  const live = liveLocations[vehicleKeyOf(tech.van)]
  if (live) return { lat: live.lat, lng: live.lng }
  return tech.lastKnownLocation ? { lat: tech.lastKnownLocation.lat, lng: tech.lastKnownLocation.lng } : null
}

/** Drive-time ETA from the van's current position to its next open stop,
 *  with a late-risk call against the stop's scheduled window. Display-only —
 *  it never writes time entries or status. */
function etaFor(
  technician: Technician | undefined,
  plan: { order: Job[] },
  liveLocations: Record<string, LiveLocation>
): { nextJob: Job; stopNumber: number; driveMinutes: number; status: "on_time" | "late" | "window_started"; byMinutes: number } | null {
  if (!technician) return null
  const nextIndex = plan.order.findIndex(job => dispatchStatus(job) !== "complete")
  if (nextIndex === -1) return null
  const nextJob = plan.order[nextIndex]
  if (!nextJob.location) return null
  const position = currentPositionOf(technician, liveLocations)
  if (!position) return null
  const driveMinutes = travelMinutes(position, nextJob.location)

  const now = new Date()
  const minutesNow = now.getHours() * 60 + now.getMinutes()
  const windowStart = DAY_START_MINUTES + nextJob.startBlock * 30
  const untilStart = windowStart - minutesNow
  if (untilStart <= 0) return { nextJob, stopNumber: nextIndex + 1, driveMinutes, status: "window_started", byMinutes: Math.abs(untilStart) }
  if (driveMinutes > untilStart) return { nextJob, stopNumber: nextIndex + 1, driveMinutes, status: "late", byMinutes: driveMinutes - untilStart }
  return { nextJob, stopNumber: nextIndex + 1, driveMinutes, status: "on_time", byMinutes: untilStart - driveMinutes }
}

export function MapSurface({
  day,
  selectedJobId,
  onSelectJob
}: {
  day: string
  /** URL-backed FieldLoop selection, shared with every other surface. */
  selectedJobId: string
  onSelectJob: (jobId: string) => void
}) {
  const jobs = useJobsList()
  const technicians = useBoardStore(s => s.technicians)
  const liveLocations = useBoardStore(s => s.liveLocations)
  const [techId, setTechId] = useState("")

  const technician = useMemo(
    () => technicians.find(item => item.id === techId),
    [technicians, techId]
  )
  // The board store updates on every telemetry ping and 5s hydration — keep
  // the derived route plan and day slice identity-stable so the map's GeoJSON
  // sources only rebuild when their actual inputs change.
  const visible = useMemo(() => jobsOnDay(jobs, day), [jobs, day])
  const plan = useMemo(
    () => computeRouteOrder(techId, jobs, technician, day),
    [techId, jobs, technician, day]
  )
  const selectedJob = useMemo(
    () => jobs.find(job => job.id === selectedJobId),
    [jobs, selectedJobId]
  )
  const selectJob = (job: Job) => onSelectJob(job.id)
  const orderedStopIds = useMemo(() => plan.order.map(job => job.id), [plan])
  const eta = useMemo(
    () => etaFor(technician, plan, liveLocations),
    [technician, plan, liveLocations]
  )
  /** Which job each van is currently on site at (geofence display only). */
  const onsiteByTech = useMemo(() => {
    const map: Record<string, string | null> = {}
    for (const tech of technicians) {
      const live = liveLocations[vehicleKeyOf(tech.van)]
      map[tech.id] = live ? arrivedJobFor(tech.id, jobs, day, live)?.id ?? null : null
    }
    return map
  }, [technicians, liveLocations, jobs, day])

  return (
    <>
      <CrewTree
        day={day}
        selectedTechId={techId}
        onSelectTech={setTechId}
        onSelectJob={selectJob}
      />
      <div
        className="fl-map"
        role="region"
        aria-label="Job map. WebGL pins are not keyboard reachable — the Crew list beside the map is the accessible job index, and routed stops carry numbered focusable badges."
      >
        <MapErrorBoundary>
          <MapLibreView
            visible={visible}
            vanId={techId}
            onSelectJob={onSelectJob}
            orderedStopIds={orderedStopIds}
            onsiteByTech={onsiteByTech}
          />
        </MapErrorBoundary>
      </div>
      <Inspector job={selectedJob} onClear={() => onSelectJob("")} title="Route plan">
        {!technician && <div className="fl-muted">Pick a crew member to order their stops.</div>}
        {technician && (
          <>
            <p>
              {technician.name} · {plan.order.length} stop
              {plan.order.length === 1 ? "" : "s"}
            </p>
            {eta && (
              <p
                className={eta.status === "late" ? "fl-flag urgent" : "fl-flag"}
                data-testid="fl-live-eta"
              >
                <Navigation size={13} />
                {eta.status === "late" && (
                  <>Van → Stop {eta.stopNumber}: ~{eta.driveMinutes} min drive · running ~{Math.round(eta.byMinutes / 5) * 5} min late</>
                )}
                {eta.status === "on_time" && (
                  <>Van → Stop {eta.stopNumber}: ~{eta.driveMinutes} min drive · on time ({Math.round(eta.byMinutes / 5) * 5} min spare)</>
                )}
                {eta.status === "window_started" && (
                  <>Van → Stop {eta.stopNumber}: ~{eta.driveMinutes} min drive · window started {eta.byMinutes} min ago</>
                )}
              </p>
            )}
            {technician.lastKnownLocation ? (
              <p>
                <MapPin size={13} />
                Last known position captured{" "}
                {formatDate(technician.lastKnownLocation.capturedAt.slice(0, 10))}
              </p>
            ) : (
              <p>No position captured for this crew member — the route starts at the first stop.</p>
            )}
            {plan.order.map((job, index) => (
              <button
                type="button"
                key={job.id}
                className="fl-flag blue"
                aria-pressed={selectedJobId === job.id}
                onClick={() => selectJob(job)}
              >
                <span>{index + 1}</span>
                <div>
                  <strong>{job.title}</strong>
                  <span>
                    {blockLabel(job.startBlock)} · {job.address}
                  </span>
                </div>
              </button>
            ))}
            <p className="fl-notice" data-testid="fl-route-provenance">
              {plan.label}. Ordering starts from the crew member&apos;s last captured position;
              the map itself plots jobs only, because technician position is captured at
              clock-in/clock-out and never tracked continuously.
            </p>
          </>
        )}
      </Inspector>
    </>
  )
}
