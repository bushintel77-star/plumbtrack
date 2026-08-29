"use client"

import { useMemo } from "react"
import { CalendarCheck, CalendarOff } from "lucide-react"
import { useQueryStates, parseAsArrayOf, parseAsString, parseAsBoolean } from "nuqs"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { blockLabel } from "@/lib/format"
import { absenceFor, jobDay } from "@/lib/schedule"
import { useBoardStore, useJobsList } from "@/stores/boardStore"
import { performAssignment } from "./actions"

type Availability =
  | { state: "leave"; reason: string }
  | { state: "on-job"; jobTitle: string }
  | { state: "free"; fromBlock: number }

/**
 * Availability panel (research §Powerful Filtering / reference Availability
 * card): a live per-technician bandwidth read-out derived from absences and
 * same-day work. When an unassigned task is selected it becomes a quick-
 * assign surface — every free, qualified row carries an ASSIGN action that
 * drops the job into the tech's first open slot.
 */
export function AvailabilityPanel({ date }: { date: string }) {
  const technicians = useBoardStore(s => s.technicians)
  const selectedJobId = useBoardStore(s => s.selectedJobId)
  const jobs = useJobsList()

  const [, setFilters] = useQueryStates({
    status: parseAsArrayOf(parseAsString).withDefault([]),
    team: parseAsArrayOf(parseAsString).withDefault([]),
    availableOnly: parseAsBoolean.withDefault(false)
  })

  const rows = useMemo(() => {
    return technicians
      .map(tech => {
        const absence = absenceFor(tech, date)
        if (absence) {
          return { tech, availability: { state: "leave", reason: absence.reason } as Availability, todayCount: 0 }
        }
        const todayJobs = jobs.filter(
          j => j.techId === tech.id && jobDay(j) === date && j.status !== "complete"
        )
        const active = todayJobs.find(j => j.status === "active" || j.status === "en_route")
        if (active) {
          return {
            tech,
            availability: { state: "on-job", jobTitle: active.title } as Availability,
            todayCount: todayJobs.length
          }
        }
        let fromBlock = 0
        for (let block = 0; block <= 20; block++) {
          const clash = todayJobs.some(
            j => block < j.startBlock + j.spanBlocks && block >= j.startBlock
          )
          if (!clash) {
            fromBlock = block
            break
          }
        }
        return { tech, availability: { state: "free", fromBlock } as Availability, todayCount: todayJobs.length }
      })
      .sort((a, b) => {
        const rank = (s: Availability["state"]): number =>
          s === "free" ? 0 : s === "on-job" ? 1 : 2
        return (
          rank(a.availability.state) - rank(b.availability.state) ||
          a.tech.name.localeCompare(b.tech.name)
        )
      })
  }, [technicians, jobs, date])

  const selectedJob = selectedJobId ? jobs.find(j => j.id === selectedJobId) : null
  const quickAssignTarget = selectedJob?.status === "unassigned" ? selectedJob : null

  const free = rows.filter(r => r.availability.state === "free").length
  const onJob = rows.filter(r => r.availability.state === "on-job").length
  const onLeave = rows.filter(r => r.availability.state === "leave").length

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-testid="availability-trigger"
          className="label-mono h-8 gap-1.5 border-line bg-recess px-2.5 text-2xs text-ink-mid hover:text-ink"
        >
          <CalendarCheck className="h-3.5 w-3.5" />
          CREWS
          <span data-testid="availability-counts" className="tnum text-ink-low">
            {free}F·{onJob}B·{onLeave}L
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="panel-strong w-80 rounded-2xl border border-line/80 bg-recess/95 p-0 shadow-[var(--chassis-shadow)] backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95" data-testid="availability-panel">
        <div className="flex items-center justify-between px-4 pt-3"><div><div className="text-sm font-semibold text-ink">Crew availability</div><div className="mt-0.5 text-2xs text-ink-low">Pick the next qualified crew at a glance</div></div><span className="rounded-full bg-chrome-wash px-2 py-1 label-mono text-2xs text-chrome-600">LIVE</span></div>
        <div className="border-b border-line/80 bg-fill/40 px-4 py-3">
          <div className="label-mono text-2xs text-ink-low">CREW BANDWIDTH · TODAY</div>
          <div className="label-mono tnum mt-1 flex gap-2 text-2xs">
            <span className="rounded-sm bg-complete-wash px-1.5 py-0.5 text-complete">{free} FREE</span>
            <span className="rounded-sm bg-active-wash px-1.5 py-0.5 text-active">{onJob} ON JOB</span>
            <span className="rounded-sm bg-pending-wash px-1.5 py-0.5 text-pending">{onLeave} ON LEAVE</span>
          </div>
          {quickAssignTarget ? (
            <p className="mt-1.5 text-2xs leading-snug text-chrome-600">
              Assigning “{quickAssignTarget.title}” — qualified free rows are one click away.
            </p>
          ) : (
            <button
              data-testid="availability-filter-toggle"
              className="mt-1.5 text-2xs text-ink-low underline-offset-2 hover:text-ink hover:underline"
              onClick={() => void setFilters({ availableOnly: true })}
            >
              Show only available crews on the board
            </button>
          )}
        </div>
        <div className="max-h-[320px] overflow-y-auto p-2">
          {rows.map(({ tech, availability, todayCount }) => {
            const qualified =
              quickAssignTarget &&
              (!quickAssignTarget.requiredSkill || tech.skills.includes(quickAssignTarget.requiredSkill))
            return (
              <div
                key={tech.id}
                data-testid={`availability-row-${tech.id}`}
                className="flex items-center gap-2 rounded-xl border border-transparent px-2.5 py-2 transition-colors hover:border-line hover:bg-fill"
              >
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="text-xs font-semibold">
                    {tech.name.split(" ")[0]}
                    <span className="label-mono ml-1.5 text-2xs font-normal text-ink-low">
                      {tech.van.toUpperCase()} · {tech.role.toUpperCase()}
                    </span>
                  </div>
                  <div className="label-mono tnum text-2xs text-ink-low">
                    {availability.state === "leave" && (
                      <span className="inline-flex items-center gap-1 text-pending">
                        <CalendarOff className="h-3 w-3" />
                        {availability.reason.toUpperCase()}
                      </span>
                    )}
                    {availability.state === "on-job" && `ON JOB · ${availability.jobTitle.toUpperCase()}`}
                    {availability.state === "free" &&
                      `FREE FROM ${blockLabel(availability.fromBlock)} · ${todayCount} TODAY`}
                  </div>
                </div>
                {quickAssignTarget ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid={`availability-assign-${tech.id}`}
                    disabled={availability.state !== "free" || !qualified}
                    className="label-mono h-6 px-2 text-2xs text-chrome-400"
                    title={
                      availability.state === "leave"
                        ? "On approved leave"
                        : !qualified
                          ? `Missing ${quickAssignTarget.requiredSkill} skill`
                          : `Assign to first free slot (${blockLabel(availability.state === "free" ? availability.fromBlock : 0)})`
                    }
                    onClick={() => {
                      if (availability.state !== "free") return
                      void performAssignment(
                        quickAssignTarget.id,
                        tech.id,
                        availability.fromBlock
                      )
                    }}
                  >
                    ASSIGN
                  </Button>
                ) : (
                  <Badge
                    className={cn(
                      "label-mono h-4 rounded-sm px-1 text-2xs",
                      availability.state === "free" && "bg-complete-wash text-complete hover:bg-complete-wash",
                      availability.state === "on-job" && "bg-active-wash text-active hover:bg-active-wash",
                      availability.state === "leave" && "bg-pending-wash text-pending hover:bg-pending-wash"
                    )}
                  >
                    {availability.state === "free" && "FREE"}
                    {availability.state === "on-job" && "BUSY"}
                    {availability.state === "leave" && "LEAVE"}
                  </Badge>
                )}
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
