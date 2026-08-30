"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { MapPin } from "lucide-react"

import { MapErrorBoundary } from "@/features/map/MapErrorBoundary"
import { blockLabel, formatDate } from "@/lib/format"
import { computeRouteOrder, jobsOnDay } from "@/lib/fieldloop"
import { useBoardStore, useJobsList } from "@/stores/boardStore"
import type { Job } from "@/types"

import { CrewTree } from "./CrewTree"

const MapLibreView = dynamic(() => import("@/features/map/MapLibreView"), {
  ssr: false,
  loading: () => <div className="fl-muted">Loading map…</div>
})

export function MapSurface({ day }: { day: string }) {
  const jobs = useJobsList()
  const technicians = useBoardStore(s => s.technicians)
  const openDetails = useBoardStore(s => s.openDetails)
  const [techId, setTechId] = useState("")
  const [selectedJobId, setSelectedJobId] = useState("")

  const technician = technicians.find(item => item.id === techId)
  const plan = computeRouteOrder(techId, jobs, technician, day)
  const visible = jobsOnDay(jobs, day)
  const selectJob = (job: Job) => {
    setSelectedJobId(job.id)
    openDetails(job.id)
  }

  return (
    <>
      <CrewTree
        day={day}
        selectedTechId={techId}
        onSelectTech={setTechId}
        onSelectJob={selectJob}
      />
      <div className="fl-map">
        <MapErrorBoundary>
          <MapLibreView visible={visible} vanId={techId} onSelectJob={openDetails} />
        </MapErrorBoundary>
      </div>
      <aside className="fl-panel fl-inspector" aria-label="Route plan">
        <div className="fl-kicker">Route plan</div>
        {!technician && <div className="fl-muted">Pick a crew member to order their stops.</div>}
        {technician && (
          <>
            <p>
              {technician.name} · {plan.order.length} stop
              {plan.order.length === 1 ? "" : "s"}
            </p>
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
      </aside>
    </>
  )
}
