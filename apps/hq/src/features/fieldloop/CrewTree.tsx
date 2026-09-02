"use client"

import { useState } from "react"
import { Search } from "lucide-react"

import { blockLabel } from "@/lib/format"
import { arrivedJobFor, dispatchStatus, jobsOnDay, livePresenceFor } from "@/lib/fieldloop"
import { cn } from "@/lib/utils"
import { useBoardStore, useJobsList } from "@/stores/boardStore"
import type { Job, Presence, Technician } from "@/types"

import { Avatar } from "./common"

const PRESENCE_LABEL: Record<Presence, string> = {
  on_job: "On job",
  on_break: "On break",
  available: "Available",
  on_leave: "On leave",
  offline: "Offline"
}

const PRESENCE_CLASS: Record<Presence, string> = {
  on_job: "on-job",
  on_break: "on-break",
  available: "available",
  on_leave: "on-leave",
  offline: "offline"
}

export function CrewTree({
  day,
  selectedTechId,
  onSelectTech,
  onSelectJob
}: {
  day: string
  selectedTechId: string
  onSelectTech: (techId: string) => void
  onSelectJob: (job: Job) => void
}) {
  const technicians = useBoardStore(s => s.technicians)
  const liveLocations = useBoardStore(s => s.liveLocations)
  const jobs = useJobsList()
  const [query, setQuery] = useState("")
  const today = jobsOnDay(jobs, day)
  const visible = technicians.filter(tech =>
    tech.name.toLowerCase().includes(query.trim().toLowerCase())
  )

  const liveFor = (tech: Technician): { presence: "on_job" | "on_break"; lat: number; lng: number } | undefined => {
    const vehicleId = `veh-${tech.van.toLowerCase().replace(/\s+/g, "-")}`
    const live = liveLocations[vehicleId]
    return live ? { presence: live.presence, lat: live.lat, lng: live.lng } : undefined
  }

  return (
    <aside className="fl-panel fl-tree" aria-label="Crew">
      <label className="fl-input">
        <Search size={13} />
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Filter crew…"
          aria-label="Filter crew"
        />
      </label>
      <div className="fl-kicker">
        Crew
        <button type="button" onClick={() => onSelectTech("")}>
          Show all
        </button>
      </div>
      {visible.map(tech => {
        const row = today.filter(job => job.techId === tech.id)
        const live = liveFor(tech)
        const presence = livePresenceFor(tech, jobs, day, live)
        const arrived = live ? arrivedJobFor(tech.id, jobs, day, live) : null
        return (
          <button
            type="button"
            key={tech.id}
            aria-pressed={selectedTechId === tech.id}
            className={cn("fl-crew", selectedTechId === tech.id && "selected")}
            onClick={() => onSelectTech(selectedTechId === tech.id ? "" : tech.id)}
          >
            <Avatar name={tech.name} />
            <div>
              <strong>{tech.name}</strong>
              <span>
                {tech.role} · {tech.van} · {row.length} job{row.length === 1 ? "" : "s"}
              </span>
              <span className={cn("fl-presence", PRESENCE_CLASS[presence])}>
                <i />
                {PRESENCE_LABEL[presence]}
              </span>
              {arrived && presence !== "on_break" && (
                <span className={cn("fl-presence", "on-job")} data-testid={`crew-arrived-${tech.id}`}>
                  <i />
                  On site · {arrived.title}
                </span>
              )}
              {row.slice(0, 3).map(job => (
                <span
                  key={job.id}
                  role="button"
                  tabIndex={0}
                  data-testid={`crew-job-${job.id}`}
                  className={cn("fl-crew-job", dispatchStatus(job))}
                  onClick={event => {
                    event.stopPropagation()
                    onSelectJob(job)
                  }}
                  onKeyDown={event => {
                    if (event.key !== "Enter" && event.key !== " ") return
                    event.stopPropagation()
                    event.preventDefault()
                    onSelectJob(job)
                  }}
                >
                  {blockLabel(job.startBlock)} · {job.title}
                </span>
              ))}
            </div>
          </button>
        )
      })}
      {visible.length === 0 && <div className="fl-muted">No crew matches “{query}”.</div>}
    </aside>
  )
}
