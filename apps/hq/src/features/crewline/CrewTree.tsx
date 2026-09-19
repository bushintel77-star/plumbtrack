"use client"

import { useState } from "react"
import { PanelLeftClose, Search } from "lucide-react"

import { blockLabel } from "@/lib/format"
import { arrivedJobFor, dispatchStatus, jobsOnDay, livePresenceFor } from "@/lib/crewline"
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
  onSelectJob,
  onCollapse
}: {
  day: string
  selectedTechId: string
  onSelectTech: (techId: string) => void
  onSelectJob: (job: Job) => void
  /** Offered only where the surface wants a collapsible panel (map). */
  onCollapse?: () => void
}) {
  const technicians = useBoardStore(s => s.technicians)
  const liveLocations = useBoardStore(s => s.liveLocations)
  const jobs = useJobsList()
  const [query, setQuery] = useState("")
  const today = jobsOnDay(jobs, day)
  const visible = technicians.filter(tech =>
    tech.name.toLowerCase().includes(query.trim().toLowerCase())
  )

  const liveFor = (tech: Technician): { presence: "on_job" | "on_break" | "off_shift"; lat: number; lng: number } | undefined => {
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
        <span className="fl-kicker-actions">
          <button type="button" onClick={() => onSelectTech("")}>
            Show all
          </button>
          {onCollapse && (
            <button
              type="button"
              className="fl-collapse-btn"
              aria-label="Collapse crew panel"
              onClick={onCollapse}
            >
              <PanelLeftClose size={13} />
            </button>
          )}
        </span>
      </div>
      {visible.map(tech => {
        const row = today.filter(job => job.techId === tech.id)
        const live = liveFor(tech)
        const presence = livePresenceFor(tech, jobs, day, live)
        const arrived = live ? arrivedJobFor(tech.id, jobs, day, live) : null
        return (
          // A card, not one giant button: the tech header and each job chip
          // are separate real controls. The previous shape nested role=button
          // children inside a <button>, which is invalid interactive content
          // — screen readers could not announce the jobs at all.
          <div key={tech.id} className={cn("fl-crew", selectedTechId === tech.id && "selected")}>
            <button
              type="button"
              className="fl-crew-head"
              aria-pressed={selectedTechId === tech.id}
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
              </div>
            </button>
            {row.length > 0 && (
              <div className="fl-crew-jobs">
                {row.slice(0, 3).map(job => (
                  <button
                    type="button"
                    key={job.id}
                    data-testid={`crew-job-${job.id}`}
                    className={cn("fl-crew-job", dispatchStatus(job))}
                    onClick={() => {
                      // Opening a job from a crew row also makes that crew
                      // member the route-plan subject, or the Route plan
                      // panel falls back to "Pick a crew member".
                      onSelectTech(tech.id)
                      onSelectJob(job)
                    }}
                  >
                    {blockLabel(job.startBlock)} · {job.title}
                  </button>
                ))}
                {row.length > 3 && (
                  <span className="fl-crew-more">+{row.length - 3} more on the board</span>
                )}
              </div>
            )}
          </div>
        )
      })}
      {visible.length === 0 && <div className="fl-muted">No crew matches “{query}”.</div>}
    </aside>
  )
}
