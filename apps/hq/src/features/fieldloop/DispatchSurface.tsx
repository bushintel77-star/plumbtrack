"use client"

import { useMemo, useState } from "react"
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core"
import { ChevronLeft, ChevronRight, Flag } from "lucide-react"

import { performAssignment } from "@/features/board/actions"
import {
  computeAttentionFlags,
  dispatchStatus,
  jobsOnDay,
  monthGrid,
  nowLineFraction,
  presenceFor,
  shiftDay,
  weekDays,
  worstSeverity
} from "@/lib/fieldloop"
import { DAY_START_MINUTES, MINUTES_PER_BLOCK, TOTAL_BLOCKS, blockLabel, dayLabel, todayIsoDay } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useBoardStore, useJobsList } from "@/stores/boardStore"
import type { Job } from "@/types"

import { CrewTree } from "./CrewTree"
import { useFailedOps } from "./failedOps"
import { AttentionPane, Inspector, SyncPane } from "./Inspector"
import { useMinuteClock } from "./useMinuteClock"

export type Zoom = "daily" | "weekly" | "monthly"

const ZOOM_LABEL: Record<Zoom, string> = { daily: "Day", weekly: "Week", monthly: "Month" }

/** Pager announcements follow the zoom: a monthly board steps a month at a time. */
function stepLabel(step: number): string {
  if (step === 1) return "day"
  if (step === 7) return "week"
  return "month"
}

const HOUR_COUNT = (TOTAL_BLOCKS * MINUTES_PER_BLOCK) / 60

function hourLabels(): string[] {
  return Array.from({ length: HOUR_COUNT }, (_, index) => {
    const hour = DAY_START_MINUTES / 60 + index
    return `${hour}:00`
  })
}

function DraggableJob({ job, onSelect }: { job: Job; onSelect: (job: Job) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `block:${job.id}` })
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-testid={`board-job-${job.id}`}
      className={cn("fl-job", dispatchStatus(job), isDragging && "dragging")}
      style={{
        left: `${(job.startBlock / TOTAL_BLOCKS) * 100}%`,
        width: `${(job.spanBlocks / TOTAL_BLOCKS) * 100}%`
      }}
      onClick={() => onSelect(job)}
    >
      {blockLabel(job.startBlock)} · {job.title}
    </button>
  )
}

/**
 * A start block is only a legal target when the dragged job still fits inside
 * the board day from there, so a late drop is refused outright instead of
 * being clamped to a time the dispatcher never chose.
 */
function DropCell({ techId, index }: { techId: string; index: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell:${techId}:${index}` })
  return (
    <div
      ref={setNodeRef}
      className={cn(isOver && "fl-lane over")}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: `${(index / TOTAL_BLOCKS) * 100}%`,
        width: `${100 / TOTAL_BLOCKS}%`
      }}
    />
  )
}

function QueueJob({ job, onSelect }: { job: Job; onSelect: (job: Job) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `block:${job.id}` })
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-testid={`queue-job-${job.id}`}
      className={cn("fl-queue-job", isDragging && "dragging")}
      onClick={() => onSelect(job)}
    >
      <Flag size={12} />
      {job.title} · {job.address}
    </button>
  )
}

function NowLine({ day, now }: { day: string; now: Date }) {
  const fraction = nowLineFraction(day, now, todayIsoDay())
  if (fraction === null) return null
  return (
    <div className="fl-now" style={{ left: `${fraction * 100}%` }} data-testid="fl-now-line">
      <span>{now.toTimeString().slice(0, 5)}</span>
    </div>
  )
}

function DayBoard({
  day,
  now,
  dragSpanBlocks,
  selectedTechId,
  onSelect
}: {
  day: string
  now: Date
  /** Span of the job currently being dragged; caps the legal start blocks. */
  dragSpanBlocks: number
  selectedTechId: string
  onSelect: (job: Job) => void
}) {
  const technicians = useBoardStore(s => s.technicians)
  const jobs = useJobsList()
  const today = jobsOnDay(jobs, day)
  return (
    <div className="fl-board" data-testid="fl-day-board">
      <div className="fl-hours" style={{ gridTemplateColumns: `repeat(${HOUR_COUNT}, 1fr)` }}>
        {hourLabels().map(label => (
          <span key={label}>{label}</span>
        ))}
      </div>
      {technicians.map(tech => {
        const presence = presenceFor(tech, jobs, day)
        const dimmed = selectedTechId !== "" && selectedTechId !== tech.id
        return (
          <div className={cn("fl-row", dimmed && "dim")} key={tech.id}>
            <div className="fl-row-head">
              {tech.name}
              <small>
                {tech.van} · {presence.replace("_", " ")}
              </small>
            </div>
            <div className={cn("fl-lane", presence === "on_leave" && "leave")}>
              <NowLine day={day} now={now} />
              {Array.from({ length: TOTAL_BLOCKS - dragSpanBlocks + 1 }, (_, index) => (
                <DropCell key={index} techId={tech.id} index={index} />
              ))}
              {today
                .filter(job => job.techId === tech.id)
                .map(job => (
                  <DraggableJob key={job.id} job={job} onSelect={onSelect} />
                ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CalendarGrid({
  days,
  day,
  onSelect
}: {
  /** ISO day per cell; null renders an honestly empty padding cell. */
  days: Array<string | null>
  day: string
  onSelect: (job: Job) => void
}) {
  const jobs = useJobsList()
  const today = todayIsoDay()
  return (
    <div className="fl-grid" data-testid="fl-calendar-grid">
      {days.map((cell, index) => {
        if (!cell) return <div className="fl-cell empty" key={`pad-${index}`} aria-hidden />
        const cellJobs = jobsOnDay(jobs, cell)
        return (
          <div
            className={cn("fl-cell", cell === today && "today")}
            key={cell}
            data-testid={`fl-cell-${cell}`}
          >
            <header>
              <span>{dayLabel(cell)}</span>
              <span>{cellJobs.length || ""}</span>
            </header>
            {cellJobs.length === 0 ? (
              <div className="fl-cell-empty">No jobs</div>
            ) : (
              cellJobs.slice(0, 4).map(job => (
                <button
                  type="button"
                  key={job.id}
                  className={cn("fl-chip", dispatchStatus(job))}
                  onClick={() => onSelect(job)}
                >
                  {blockLabel(job.startBlock)} {job.title}
                </button>
              ))
            )}
            {cellJobs.length > 4 && (
              <div className="fl-cell-empty">+{cellJobs.length - 4} more</div>
            )}
            {cell === day && <span className="sr-only">Selected day</span>}
          </div>
        )
      })}
    </div>
  )
}

/** Week: technician rows × 7 real dates, compact status chips per cell. */
function WeekGrid({
  day,
  selectedTechId,
  onSelect
}: {
  day: string
  selectedTechId: string
  onSelect: (job: Job) => void
}) {
  const technicians = useBoardStore(s => s.technicians)
  const jobs = useJobsList()
  const days = weekDays(day)
  return (
    <div className="fl-week" data-testid="fl-week-grid">
      <div className="fl-week-head">
        <span />
        {days.map(cell => (
          <span key={cell} className={cn(cell === todayIsoDay() && "today")}>
            {dayLabel(cell)}
          </span>
        ))}
      </div>
      {technicians.map(tech => (
        <div
          className={cn("fl-week-row", selectedTechId !== "" && selectedTechId !== tech.id && "dim")}
          key={tech.id}
        >
          <span className="fl-week-name">{tech.name}</span>
          {days.map(cell => {
            const cellJobs = jobsOnDay(jobs, cell).filter(job => job.techId === tech.id)
            return (
              <div className="fl-week-cell" key={cell} data-testid={`fl-week-${tech.id}-${cell}`}>
                {cellJobs.map(job => (
                  <button
                    type="button"
                    key={job.id}
                    className={cn("fl-chip", dispatchStatus(job))}
                    onClick={() => onSelect(job)}
                  >
                    {blockLabel(job.startBlock)}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export function DispatchSurface({
  day,
  onDayChange,
  zoom,
  onZoomChange,
  selectedJobId,
  onSelectJob,
  selectedTechId,
  onSelectTech
}: {
  day: string
  onDayChange: (day: string) => void
  zoom: Zoom
  onZoomChange: (zoom: Zoom) => void
  selectedJobId: string
  onSelectJob: (jobId: string) => void
  selectedTechId: string
  onSelectTech: (techId: string) => void
}) {
  const jobs = useJobsList()
  const technicians = useBoardStore(s => s.technicians)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const now = useMinuteClock()
  const today = jobsOnDay(jobs, day)
  const flags = useMemo(
    () => computeAttentionFlags(jobs, technicians, day, now),
    [jobs, technicians, day, now]
  )
  const [dragJobId, setDragJobId] = useState("")
  const dragSpanBlocks = jobs.find(job => job.id === dragJobId)?.spanBlocks ?? 1
  const selectedJob = jobs.find(job => job.id === selectedJobId)
  const queued = today.filter(job => !job.techId)
  const complete = today.filter(job => dispatchStatus(job) === "complete").length
  const step = zoom === "daily" ? 1 : zoom === "weekly" ? 7 : 28
  const syncPaneOpen = useFailedOps(s => s.syncPaneOpen)
  const recordFailure = useFailedOps(s => s.record)
  const refreshFailure = useFailedOps(s => s.refresh)
  const canAssign = useBoardStore(s => s.canAssign)

  /**
   * Runs a move through the authoritative path and, when the board rolls back,
   * writes the rejection into the failed-op ledger so it stays visible in the
   * sync pane instead of vanishing with the toast.
   */
  const applyMove = async (
    jobId: string,
    techId: string,
    startBlock: number,
    existingOpId?: string
  ): Promise<boolean> => {
    const reason = canAssign(jobId, techId, startBlock).reason
    const ok = await performAssignment(jobId, techId, startBlock)
    if (!ok) {
      // A retry keeps its original ledger entry and just restates why it
      // failed; only a first failure adds a row.
      if (existingOpId) {
        refreshFailure(existingOpId, reason ?? "The server rejected this move.")
        return ok
      }
      recordFailure({
        jobId,
        jobTitle: jobs.find(job => job.id === jobId)?.title ?? jobId,
        techId,
        techName: technicians.find(tech => tech.id === techId)?.name ?? techId,
        startBlock,
        reason: reason ?? "The server rejected this move."
      })
    }
    return ok
  }

  const onDragEnd = (event: DragEndEvent) => {
    setDragJobId("")
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : ""
    if (!activeId.startsWith("block:") || !overId.startsWith("cell:")) return
    const jobId = activeId.slice("block:".length)
    const [, techId, block] = overId.split(":")
    const span = jobs.find(job => job.id === jobId)?.spanBlocks ?? 1
    if (Number(block) + span > TOTAL_BLOCKS) return
    // Optimistic placement, server-authoritative outcome: performAssignment
    // snapshots, applies, persists, and rolls the board back on rejection.
    void applyMove(jobId, techId, Number(block))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={event => setDragJobId(String(event.active.id).slice("block:".length))}
      onDragCancel={() => setDragJobId("")}
      onDragEnd={onDragEnd}
    >
      <CrewTree
        day={day}
        selectedTechId={selectedTechId}
        onSelectTech={onSelectTech}
        onSelectJob={job => onSelectJob(job.id)}
      />
      <main className="fl-canvas">
        <div className="fl-canvas-toolbar">
          <div>
            <strong className={cn("fl-count", worstSeverity(flags))} data-testid="fl-attention-count">
              {flags.length}
            </strong>
            <b>need attention</b>
            <span>
              {" "}
              · {today.length} job{today.length === 1 ? "" : "s"} · {complete} complete
            </span>
          </div>
          <div className="fl-nav">
            {/* View-option switcher: toggle buttons with aria-pressed, not a
                tablist — there are no tab panels, and the ARIA tabs pattern
                would demand roving arrow-key focus this control never had. */}
            <div className="fl-segment" role="group" aria-label="Board zoom">
              {(["daily", "weekly", "monthly"] as Zoom[]).map(item => (
                <button
                  type="button"
                  key={item}
                  aria-pressed={zoom === item}
                  className={cn(zoom === item && "active")}
                  onClick={() => onZoomChange(item)}
                >
                  {ZOOM_LABEL[item]}
                </button>
              ))}
            </div>
            <button type="button" aria-label={`Previous ${stepLabel(step)}`} onClick={() => onDayChange(shiftDay(day, -step))}>
              <ChevronLeft size={13} />
            </button>
            {/* Live region: navigating days re-announces the new date. */}
            <span data-testid="fl-day-label" aria-live="polite">{dayLabel(day)}</span>
            <button type="button" aria-label={`Next ${stepLabel(step)}`} onClick={() => onDayChange(shiftDay(day, step))}>
              <ChevronRight size={13} />
            </button>
          </div>
        </div>

        {zoom === "daily" && (
          <div className="fl-queue">
            <span>Unassigned</span>
            {queued.length === 0 ? (
              <span>Everything on this day has a crew.</span>
            ) : (
              queued.map(job => (
                <QueueJob key={job.id} job={job} onSelect={next => onSelectJob(next.id)} />
              ))
            )}
          </div>
        )}

        {zoom === "daily" && (
          <DayBoard
            day={day}
            now={now}
            dragSpanBlocks={dragSpanBlocks}
            selectedTechId={selectedTechId}
            onSelect={job => onSelectJob(job.id)}
          />
        )}
        {zoom === "weekly" && (
          <WeekGrid
            day={day}
            selectedTechId={selectedTechId}
            onSelect={job => onSelectJob(job.id)}
          />
        )}
        {zoom === "monthly" && (
          <CalendarGrid
            days={monthGrid(day).map(cell => cell.day)}
            day={day}
            onSelect={job => onSelectJob(job.id)}
          />
        )}
      </main>
      <Inspector
        job={syncPaneOpen ? undefined : selectedJob}
        onClear={() => onSelectJob("")}
        onAssign={applyMove}
        title={syncPaneOpen ? "Connection & sync" : "Needs attention"}
      >
        {syncPaneOpen ? (
          <SyncPane onRetry={applyMove} />
        ) : (
          <AttentionPane flags={flags} onSelect={onSelectJob} />
        )}
      </Inspector>
    </DndContext>
  )
}
