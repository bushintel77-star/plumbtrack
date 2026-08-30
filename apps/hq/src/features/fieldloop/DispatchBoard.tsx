"use client"

import { useMemo, useState } from "react"
import { Check, ChevronLeft, ChevronRight, Flag } from "lucide-react"

import {
  blockEndMinutes,
  blockStartMinutes,
  dispatchStatus,
  dispatchStatusHex,
  formatClockCompact,
  monthDays,
  monthLabel,
  presenceFor,
  shiftIsoDay,
  toIsoDay,
  weekDays,
  weekRangeLabel,
  WEEKDAY_LABELS,
  worstSeverity
} from "@/lib/fieldloop"
import { DAY_START_MINUTES, MINUTES_PER_BLOCK, TOTAL_BLOCKS, dayLabel } from "@/lib/format"
import { jobDay } from "@/lib/schedule"
import { cn } from "@/lib/utils"
import { useBoardStore } from "@/stores/boardStore"
import type { Job } from "@/types"

import { useFieldLoop } from "./context"
import { Avatar } from "./primitives"

const BOARD_END_MINUTES = DAY_START_MINUTES + TOTAL_BLOCKS * MINUTES_PER_BLOCK
const BOARD_SPAN_MINUTES = BOARD_END_MINUTES - DAY_START_MINUTES

/** Percentage across the board day for an absolute minute-of-day. */
function positionPct(minutes: number): number {
  return ((minutes - DAY_START_MINUTES) / BOARD_SPAN_MINUTES) * 100
}

function widthPct(job: Job): number {
  return (job.spanBlocks * MINUTES_PER_BLOCK) / BOARD_SPAN_MINUTES * 100
}

/* ------------------------------------------------------------------ *
 * North-star summary — the count is the number of computed flags, not
 * the number of open jobs (spec §4.1).
 * ------------------------------------------------------------------ */

function NorthStar() {
  const { flags, dayJobs } = useFieldLoop()
  const total = dayJobs.length
  const complete = dayJobs.filter(job => job.status === "complete").length
  const severity = worstSeverity(flags)

  if (flags.length === 0) {
    return (
      <div className="fl-northstar" data-testid="fl-northstar" data-flag-count="0">
        <span className="fl-ns-num" data-sev="green">
          <Check size={30} aria-hidden />
        </span>
        <span className="fl-ns-label">All clear</span>
        <span className="fl-ns-sub">· {total} jobs today</span>
      </div>
    )
  }

  return (
    <div className="fl-northstar" data-testid="fl-northstar" data-flag-count={flags.length}>
      <span className="fl-ns-num" data-sev={severity}>
        {flags.length}
      </span>
      <span className="fl-ns-label">need{flags.length === 1 ? "s" : ""} attention</span>
      <span className="fl-ns-sub">
        · {total} jobs today · {complete} complete
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Day zoom — hour timeline per technician, live now-line, drag/drop.
 * ------------------------------------------------------------------ */

function HourRuler() {
  const ticks: React.ReactNode[] = []
  for (let minutes = DAY_START_MINUTES; minutes <= BOARD_END_MINUTES; minutes += 60) {
    const hour = minutes / 60
    const label = hour === 12 ? "12p" : hour > 12 ? `${hour - 12}p` : `${hour}a`
    const pct = positionPct(minutes)
    const style: React.CSSProperties =
      minutes === DAY_START_MINUTES
        ? { left: 0 }
        : minutes === BOARD_END_MINUTES
          ? { right: 0 }
          : { left: `${pct}%`, transform: "translateX(-50%)" }
    ticks.push(
      <span className="fl-tick" style={style} key={minutes}>
        {label}
      </span>
    )
  }
  return <div className="fl-ruler">{ticks}</div>
}

function JobBlock({
  job,
  pending,
  settled,
  onOpen,
  onDragStart
}: {
  job: Job
  pending: boolean
  settled: boolean
  onOpen: () => void
  onDragStart: () => void
}) {
  const start = blockStartMinutes(job)
  const end = blockEndMinutes(job)
  const status = dispatchStatus(job)
  return (
    <button
      type="button"
      className="fl-job"
      data-status={status}
      data-pending={pending}
      data-settled={settled}
      data-testid={`fl-job-${job.id}`}
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      style={{ left: `${positionPct(start)}%`, width: `${widthPct(job)}%` }}
      title={`${job.title} — ${job.address}`}
    >
      <span className="fl-job-time">
        {formatClockCompact(start)}–{formatClockCompact(end)}
      </span>
      <span className="fl-job-title">{job.title}</span>
      <span className="fl-job-addr">{job.address}</span>
    </button>
  )
}

function DayGrid() {
  const {
    technicians,
    jobs,
    dayJobs,
    boardDay,
    highlightedTechId,
    openJob,
    toast,
    pushFailedOp,
    now
  } = useFieldLoop()
  const canAssign = useBoardStore(state => state.canAssign)
  const assignJob = useBoardStore(state => state.assignJob)

  const [dragJobId, setDragJobId] = useState<string | null>(null)
  const [dropTechId, setDropTechId] = useState<string | null>(null)
  /** Optimistic overlay: jobId → techId it has been moved to but not confirmed. */
  const [pending, setPending] = useState<Record<string, string>>({})
  const [settled, setSettled] = useState<string | null>(null)

  const isToday = boardDay === toIsoDay(new Date())
  const showNowLine = isToday && now >= DAY_START_MINUTES && now <= BOARD_END_MINUTES

  const handleDrop = (techId: string): void => {
    setDropTechId(null)
    const jobId = dragJobId
    setDragJobId(null)
    if (!jobId) return
    const job = jobs.find(item => item.id === jobId)
    if (!job || job.techId === techId) return

    // 1. Optimistic: the block moves rows immediately and reads as pending.
    setPending(current => ({ ...current, [jobId]: techId }))

    // 2. Confirm. `canAssign` is the authority here (leave, skill, overlap);
    //    when the assignment endpoint lands this becomes the network call and
    //    the optimistic-then-confirm/rollback shape below does not change.
    window.setTimeout(() => {
      const verdict = canAssign(jobId, techId, job.startBlock)
      setPending(current => {
        const next = { ...current }
        delete next[jobId]
        return next
      })

      if (!verdict.ok) {
        // 3a. Rollback — the block returns to its committed row, and the
        //     rejection is recorded rather than swallowed.
        const tech = technicians.find(item => item.id === techId)
        pushFailedOp({
          id: `assign-${jobId}-${Date.now()}`,
          title: "Reassignment failed",
          detail:
            verdict.reason ??
            `${job.title} couldn't be moved to ${tech?.name ?? "that technician"}.`,
          // Retrying a business-rule rejection re-runs the same check, so a
          // genuinely invalid move fails again instead of appearing to work.
          retry: () => canAssign(jobId, techId, job.startBlock)
        })
        toast(verdict.reason ?? "Reassignment failed")
        return
      }

      // 3b. Commit.
      assignJob(jobId, techId, job.startBlock)
      setSettled(jobId)
      window.setTimeout(() => setSettled(null), 700)
      const tech = technicians.find(item => item.id === techId)
      toast(`Reassigned to ${tech?.name ?? "technician"}`)
    }, 450)
  }

  return (
    <div className="fl-day-grid">
      <HourRuler />
      <div className="fl-rows" data-testid="fl-day-grid">
        {showNowLine && (
          <div className="fl-now" style={{ left: `${positionPct(now)}%` }}>
            <span className="fl-now-flag">{formatClockCompact(now)}</span>
          </div>
        )}
        {technicians.map(tech => {
          const presence = presenceFor(tech, jobs, boardDay)
          const rowJobs = dayJobs.filter(job => {
            const overlay = pending[job.id]
            return overlay ? overlay === tech.id : job.techId === tech.id
          })
          const dimmed = Boolean(highlightedTechId) && highlightedTechId !== tech.id
          return (
            <div
              key={tech.id}
              className={cn(
                "fl-row",
                dropTechId === tech.id && "drop-target",
                presence === "on_leave" && "row-blocked"
              )}
              data-testid={`fl-row-${tech.id}`}
              data-tech={tech.id}
              style={{ opacity: dimmed ? 0.35 : 1 }}
              onDragOver={event => {
                event.preventDefault()
                setDropTechId(tech.id)
              }}
              onDragLeave={() => setDropTechId(current => (current === tech.id ? null : current))}
              onDrop={event => {
                event.preventDefault()
                handleDrop(tech.id)
              }}
            >
              {rowJobs.map(job => (
                <JobBlock
                  key={job.id}
                  job={job}
                  pending={Boolean(pending[job.id])}
                  settled={settled === job.id}
                  onOpen={() => openJob(job.id)}
                  onDragStart={() => setDragJobId(job.id)}
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Week zoom — 7 real dates × technician.
 * ------------------------------------------------------------------ */

function WeekGrid() {
  const { technicians, jobs, boardDay, openJob, highlightedTechId } = useFieldLoop()
  const days = useMemo(() => weekDays(boardDay), [boardDay])

  return (
    <div className="fl-week" data-testid="fl-week-grid">
      <div className="fl-week-head">
        <div className="fl-week-tech" />
        {days.map(day => (
          <div key={day.isoDay} className={cn("fl-week-day", day.isToday && "today")}>
            {day.weekdayLabel}
            <span>{day.dayOfMonth}</span>
          </div>
        ))}
      </div>
      {technicians.map(tech => {
        const dimmed = Boolean(highlightedTechId) && highlightedTechId !== tech.id
        return (
          <div key={tech.id} className="fl-week-row" style={{ opacity: dimmed ? 0.35 : 1 }}>
            <div className="fl-week-tech">
              <Avatar name={tech.name} size="sm" />
              {tech.name}
            </div>
            {days.map(day => {
              const cellJobs = jobs.filter(
                job => job.techId === tech.id && jobDay(job) === day.isoDay
              )
              return (
                <div
                  key={day.isoDay}
                  className={cn("fl-week-cell", day.isToday && "today")}
                  data-testid={`fl-week-cell-${tech.id}-${day.isoDay}`}
                >
                  {cellJobs.map(job => (
                    <button
                      type="button"
                      key={job.id}
                      className="fl-week-chip"
                      data-status={dispatchStatus(job)}
                      onClick={() => openJob(job.id)}
                      title={`${job.title} — ${job.address}`}
                    >
                      {job.title}
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Month zoom — a true calendar. Days with no jobs stay empty.
 * ------------------------------------------------------------------ */

function MonthGrid() {
  const { jobs, boardDay, setBoardDay, setZoom, toast } = useFieldLoop()
  const cells = useMemo(() => monthDays(boardDay), [boardDay])

  return (
    <div className="fl-month" data-testid="fl-month-grid">
      <div className="fl-month-head">
        {WEEKDAY_LABELS.map(label => (
          <div key={label}>{label}</div>
        ))}
      </div>
      <div className="fl-month-body">
        {cells.map(cell => {
          const dayJobs = jobs.filter(job => jobDay(job) === cell.isoDay)
          return (
            <button
              type="button"
              key={cell.isoDay}
              className={cn("fl-month-cell", cell.outOfMonth && "out", cell.isToday && "today")}
              data-testid={`fl-month-cell-${cell.isoDay}`}
              data-job-count={dayJobs.length}
              onClick={() => {
                if (dayJobs.length === 0) {
                  toast(`No jobs scheduled — ${dayLabel(cell.isoDay)}`)
                  return
                }
                setBoardDay(cell.isoDay)
                setZoom("day")
              }}
            >
              <span className="fl-month-num">{cell.dayOfMonth}</span>
              <span className="fl-month-dots">
                {dayJobs.map(job => (
                  <span
                    key={job.id}
                    className="fl-month-dot"
                    style={{ background: dispatchStatusHex(job) }}
                    title={job.title}
                  />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function UnassignedLane() {
  const { dayJobs, openJob } = useFieldLoop()
  const unassigned = dayJobs.filter(job => !job.techId)
  if (unassigned.length === 0) return null
  return (
    <div className="fl-unassigned" data-testid="fl-unassigned-lane">
      <span className="fl-unassigned-label">Unassigned</span>
      {unassigned.map(job => (
        <button
          type="button"
          key={job.id}
          className="fl-unassigned-chip"
          onClick={() => openJob(job.id)}
        >
          <Flag size={12} aria-hidden />
          <span>{job.title}</span>
          <span className="fl-addr">· {job.address}</span>
        </button>
      ))}
    </div>
  )
}

export function DispatchBoard() {
  const { zoom, setZoom, boardDay, setBoardDay } = useFieldLoop()

  const step = zoom === "day" ? 1 : zoom === "week" ? 7 : 30
  const rangeLabel =
    zoom === "day"
      ? dayLabel(boardDay)
      : zoom === "week"
        ? weekRangeLabel(boardDay)
        : monthLabel(boardDay)

  return (
    <>
      <div className="fl-canvas-toolbar">
        <NorthStar />
        <div className="fl-day-nav">
          <div className="fl-zoom" role="group" aria-label="Board zoom">
            {(["day", "week", "month"] as const).map(option => (
              <button
                type="button"
                key={option}
                className={cn(zoom === option && "active")}
                aria-pressed={zoom === option}
                data-testid={`fl-zoom-${option}`}
                onClick={() => setZoom(option)}
              >
                {option[0].toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="fl-day-nav-btn"
            aria-label="Previous"
            onClick={() => setBoardDay(shiftIsoDay(boardDay, -step))}
          >
            <ChevronLeft size={13} aria-hidden />
          </button>
          <span className="fl-day-label" data-testid="fl-range-label">
            {rangeLabel}
          </span>
          <button
            type="button"
            className="fl-day-nav-btn"
            aria-label="Next"
            onClick={() => setBoardDay(shiftIsoDay(boardDay, step))}
          >
            <ChevronRight size={13} aria-hidden />
          </button>
        </div>
      </div>

      {zoom === "day" && <UnassignedLane />}
      {zoom === "day" && <DayGrid />}
      {zoom === "week" && <WeekGrid />}
      {zoom === "month" && <MonthGrid />}
    </>
  )
}
