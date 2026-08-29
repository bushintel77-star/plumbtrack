"use client"

import { useDroppable } from "@dnd-kit/core"
import { Ban, CalendarOff } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { blockLabel, dayLabel, TOTAL_BLOCKS } from "@/lib/format"
import { travelMinutes } from "@/lib/travel"
import { absenceFor, jobDay } from "@/lib/schedule"
import { useBoardStore, useJobsList } from "@/stores/boardStore"
import type { AssignCheck, Job, Technician } from "@/types"
import { personColor, statusStyleFor } from "@/lib/statusStyles"

import { JobBlock } from "./JobBlock"
import type { BoardFilters } from "@/features/board/filters"
import { jobMatchesFilters, techMatchesFilters } from "@/features/board/filters"

interface DragContext {
  jobId: string
  overTechId: string | null
  check: AssignCheck | null
}

export interface BestSlot {
  techId: string
  block: number
  spanBlocks: number
}

const HASH_OVERLAY =
  "repeating-linear-gradient(45deg, var(--divider-etch) 0 6px, transparent 6px 12px)"

function initials(name: string): string {
  return name
    .split(" ")
    .map(part => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function nowFraction(): number {
  const now = new Date()
  const minutes = now.getHours() * 60 + now.getMinutes()
  const start = 8 * 60
  const span = TOTAL_BLOCKS * 30
  return Math.max(0, Math.min(1, (minutes - start) / span))
}

interface TravelSegment {
  key: string
  fromBlock: number
  toBlock: number
  minutes: number
  tight: boolean
}

function travelSegments(rowJobs: Job[]): TravelSegment[] {
  const located = rowJobs
    .filter(j => j.location)
    .sort((a, b) => a.startBlock - b.startBlock)
  const segments: TravelSegment[] = []
  for (let i = 0; i < located.length - 1; i++) {
    const a = located[i]
    const b = located[i + 1]
    const fromBlock = a.startBlock + a.spanBlocks
    const toBlock = b.startBlock
    if (toBlock <= fromBlock) continue
    const gapMinutes = (toBlock - fromBlock) * 30
    const minutes = travelMinutes(a.location!, b.location!)
    segments.push({
      key: `${a.id}-${b.id}`,
      fromBlock,
      toBlock,
      minutes,
      tight: minutes > gapMinutes
    })
  }
  return segments
}

function TravelBands({ rowJobs }: { rowJobs: Job[] }) {
  const segments = travelSegments(rowJobs)
  if (segments.length === 0) return null
  return (
    <>
      {segments.map(segment => (
        <div
          key={segment.key}
          data-testid={`travel-segment-${segment.key}`}
          data-tight={segment.tight}
          title={
            segment.tight
              ? `Transit estimate ${segment.minutes} min exceeds the ${((segment.toBlock - segment.fromBlock) * 30)} min gap`
              : `~${segment.minutes} min transit`
          }
          className={cn(
            "pointer-events-none absolute top-1 z-[4] flex h-4 items-center justify-center",
            segment.tight ? "rounded-sm border border-urgent" : "rounded-sm border border-chrome-400/50"
          )}
          style={{
            left: `${(segment.fromBlock / TOTAL_BLOCKS) * 100}%`,
            width: `${((segment.toBlock - segment.fromBlock) / TOTAL_BLOCKS) * 100}%`,
            backgroundImage: segment.tight
              ? "repeating-linear-gradient(45deg, var(--wash-urgent) 0 5px, transparent 5px 10px)"
              : "repeating-linear-gradient(45deg, var(--wash-chrome) 0 5px, transparent 5px 10px)"
          }}
        >
          <span
            className={cn(
              "label-mono tnum rounded px-1 text-2xs",
              segment.tight ? "text-urgent" : "text-chrome-600"
            )}
          >
            →{segment.minutes}M
          </span>
        </div>
      ))}
    </>
  )
}

/**
 * Slot-level droppable cells (research §Phase 2): every 30-minute block is
 * its own droppable with a deterministic composite id (`cell:techId:block`)
 * so drops resolve to an exact slot. While a qualifying drag hovers the row,
 * free cells light chrome and occupied cells red-stripe — validation during
 * the interaction, not after the drop.
 */
function SlotCell({
  techId,
  index,
  occupied,
  showSlots
}: {
  techId: string
  index: number
  occupied: boolean
  showSlots: boolean
}) {
  const { setNodeRef } = useDroppable({ id: `cell:${techId}:${index}` })
  return (
    <div
      ref={setNodeRef}
      data-testid={`slot-${index}`}
      data-valid={!occupied}
      className={cn(
        "pointer-events-none absolute inset-y-1",
        showSlots &&
          (occupied
            ? "z-[4] border-y border-urgent/60 bg-urgent-wash [background-image:repeating-linear-gradient(45deg,var(--wash-urgent)_0_5px,transparent_5px_10px)]"
            : "z-[4] border-y border-chrome-600/50 bg-chrome-wash")
      )}
      style={{
        left: `${(index / TOTAL_BLOCKS) * 100}%`,
        width: `${(1 / TOTAL_BLOCKS) * 100}%`
      }}
    />
  )
}

function SlotCells({
  tech,
  rowJobs,
  showSlots
}: {
  tech: Technician
  rowJobs: Job[]
  showSlots: boolean
}) {
  return (
    <>
      {Array.from({ length: TOTAL_BLOCKS }, (_, i) => (
        <SlotCell
          key={i}
          techId={tech.id}
          index={i}
          occupied={rowJobs.some(
            job => i >= job.startBlock && i < job.startBlock + job.spanBlocks
          )}
          showSlots={showSlots}
        />
      ))}
    </>
  )
}

function TimelineRow({
  tech,
  techIndex,
  jobs,
  drag,
  date,
  bestSlot
}: {
  tech: Technician
  techIndex: number
  jobs: Job[]
  drag: DragContext | null
  date: string
  bestSlot: BestSlot | null
}) {
  const openDetails = useBoardStore(s => s.openDetails)
  const technicians = useBoardStore(s => s.technicians)

  const rowJobs = jobs.filter(j => j.techId === tech.id)
  const revealJob = (jobId: string) => { window.dispatchEvent(new CustomEvent("hq-dispatch-focus-job", { detail: jobId })) }
  const activeJob = rowJobs.find(j => j.status === "active")
  const absence = absenceFor(tech, date)

  const hovering = drag?.overTechId === tech.id
  const valid = drag?.check?.ok ?? false
  const showBlocked = Boolean(hovering && !valid)
  const showSlots = Boolean(hovering && valid)
  const showBest = bestSlot?.techId === tech.id

  return (
    <div
      data-testid={`tech-row-${tech.id}`}
      className="grid border-b border-line/50"
      style={{ gridTemplateColumns: `176px repeat(${TOTAL_BLOCKS}, minmax(46px, 1fr))` }}
    >
      <div className="sticky left-0 z-10 flex items-center gap-2.5 border-r border-line bg-void-95 px-3 py-2 backdrop-blur">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fill text-[11px] font-bold",
            activeJob && "ring-2 ring-active",
            absence && "opacity-60"
          )}
          style={{ color: personColor(tech, technicians) }}
        >
          {initials(tech.name)}
        </div>
        <div className="min-w-0 leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold">{tech.name.split(" ")[0]}</span>
            {activeJob && (
              <Badge className="label-mono h-4 animate-pulse-soft rounded-sm bg-active-wash px-1 text-2xs text-active hover:bg-active-wash">
                ACTIVE
              </Badge>
            )}
            {absence && (
              <Badge
                variant="outline"
                className="label-mono h-4 shrink-0 rounded-sm bg-pending-wash px-1 text-2xs text-pending"
                title={absence.reason}
              >
                <CalendarOff className="mr-0.5 h-2.5 w-2.5" />
                LEAVE
              </Badge>
            )}
          </div>
          <div className="label-mono tnum truncate text-2xs text-ink-low">
            {tech.name.split(" ").slice(1).join(" ")} · {tech.van} · {tech.role.toUpperCase()}
          </div>
        </div>
        {showBlocked && (
          <span
            data-testid={`row-blocked-${tech.id}`}
            title={drag?.check?.reason}
            className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-urgent bg-urgent-wash text-urgent"
          >
            <Ban className="h-3.5 w-3.5" />
          </span>
        )}
      </div>

      <div
        data-testid={`row-body-${tech.id}`}
        className={cn(
          "relative h-[68px] transition-colors",
          showSlots && "bg-chrome-wash/40",
          showBlocked && "bg-urgent-wash ring-1 ring-inset ring-urgent"
        )}
        style={{
          gridColumn: `2 / span ${TOTAL_BLOCKS}`,
          backgroundImage:
            "linear-gradient(to right, var(--divider-etch) 1px, transparent 1px)",
          backgroundSize: `calc(100% / ${TOTAL_BLOCKS}) 100%`
        }}
      >
        <TravelBands rowJobs={rowJobs} />
        <SlotCells tech={tech} rowJobs={rowJobs} showSlots={showSlots} />
        {absence && (
          <div
            data-testid={`absence-row-${tech.id}`}
            title={`${absence.reason} · ${absence.from} → ${absence.to}`}
            className="pointer-events-none absolute inset-0 z-[7]"
            style={{ backgroundImage: HASH_OVERLAY, backgroundSize: "12px 12px" }}
          />
        )}
        {showBest && bestSlot && (
          <div
            data-testid="best-slot"
            style={{
              left: `${(bestSlot.block / TOTAL_BLOCKS) * 100}%`,
              width: `${(bestSlot.spanBlocks / TOTAL_BLOCKS) * 100}%`
            }}
            className="pointer-events-none absolute inset-y-1 z-[6] flex items-center justify-center rounded-md border-2 border-dashed border-chrome-600 bg-chrome-wash"
          >
            <span className="label-mono rounded bg-chrome-600 px-1.5 text-2xs text-on-accent">
              BEST
            </span>
          </div>
        )}
        {rowJobs.map(job => (
          <JobBlock key={job.id} job={job} onSelect={jobId => { openDetails(jobId); revealJob(jobId) }} />
        ))}
      </div>
    </div>
  )
}

/* ── Weekly / monthly zoom grid ─────────────────────────────────────────── */

function mondayOf(isoDayString: string): string {
  const d = new Date(`${isoDayString}T12:00:00`)
  const offset = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - offset)
  return d.toISOString().slice(0, 10)
}

function shiftDay(isoDayString: string, delta: number): string {
  const d = new Date(`${isoDayString}T12:00:00`)
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

function ZoomGrid({
  filters,
  zoom,
  techs,
  jobs
}: {
  filters: BoardFilters
  zoom: string
  techs: Technician[]
  jobs: Job[]
}) {
  const openDetails = useBoardStore(s => s.openDetails)
  const base = mondayOf(filters.date)
  const columns =
    zoom === "monthly"
      ? [0, 7, 14, 21].map(w => ({
          label: `WEEK OF ${dayLabel(shiftDay(base, w)).toUpperCase()}`,
          from: shiftDay(base, w),
          to: shiftDay(base, w + 6)
        }))
      : Array.from({ length: 7 }, (_, i) => {
          const day = shiftDay(base, i)
          return { label: dayLabel(day).toUpperCase(), from: day, to: day }
        })

  return (
    <div className="scrollbar-thin h-full overflow-auto p-4" data-testid={`${zoom}-view`}>
      <div className="min-w-[980px]">
        <div
          className="sticky top-0 z-20 grid border-b border-line bg-void-90 backdrop-blur"
          style={{ gridTemplateColumns: `176px repeat(${columns.length}, minmax(110px, 1fr))` }}
        >
          <div className="label-mono sticky left-0 z-10 border-r border-line bg-void-95 px-3 py-1.5 text-2xs text-ink-low">
            TECHNICIAN
          </div>
          {columns.map(col => (
            <div key={col.from} className="label-mono py-1.5 text-center text-2xs text-ink-mid">
              {col.label}
            </div>
          ))}
        </div>

        {techs.map((tech, techIndex) => (
          <div
            key={tech.id}
            data-testid={`zoom-row-${tech.id}`}
            className="grid border-b border-line/50"
            style={{ gridTemplateColumns: `176px repeat(${columns.length}, minmax(110px, 1fr))` }}
          >
            <div
              className={cn(
                "sticky left-0 z-10 flex items-center gap-2 border-r border-line bg-void-95 px-3 text-[13px] font-semibold backdrop-blur",
              )}
            >
              {tech.name.split(" ")[0]}
            </div>
            {columns.map((col, colIndex) => {
              const absence = absenceFor(tech, col.from)
              const cellJobs = jobs.filter(
                j => {
                  const day = jobDay(j)
                  return j.techId === tech.id && day >= col.from && day <= col.to
                }
              )
              return (
                <div
                  key={col.from}
                  data-testid={`zoom-cell-${tech.id}-${colIndex}`}
                  className={cn(
                    "relative min-h-[56px] space-y-1 border-r border-line/40 p-1",
                    absence && "opacity-80"
                  )}
                  style={absence ? { backgroundImage: HASH_OVERLAY, backgroundSize: "12px 12px" } : undefined}
                >
                  {absence && cellJobs.length === 0 && (
                    <span className="label-mono absolute inset-0 flex items-center justify-center text-2xs text-ink-low">
                      ON LEAVE
                    </span>
                  )}
                  {cellJobs.map(job => (
                    <button
                      key={job.id}
                      data-testid={`zoom-chip-${job.id}`}
                      onClick={() => openDetails(job.id)}
                      title={`${job.title} · ${jobDay(job)}`}
                      className={cn(
                        "flex w-full items-center gap-1 rounded border px-1.5 py-1 text-left text-2xs font-semibold",
                        `${statusStyleFor(job).chip} border-line`
                      )}
                    >
                      {job.linkedGroupId && <span className="text-chrome-400">⧉</span>}
                      <span className="truncate">{job.title}</span>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Canvas ─────────────────────────────────────────────────────────────── */

export function DispatchCanvas({
  filters,
  zoom,
  drag,
  bestSlot
}: {
  filters: BoardFilters
  zoom: string
  drag: DragContext | null
  bestSlot: BestSlot | null
}) {
  const technicians = useBoardStore(s => s.technicians)
  const jobs = useJobsList()
  const visible = jobs.filter(job => jobMatchesFilters(job, filters))
  const visibleTechs = technicians.filter(tech => techMatchesFilters(tech, filters))

  if (zoom !== "daily") {
    return <ZoomGrid filters={filters} zoom={zoom} techs={visibleTechs} jobs={visible} />
  }

  const fraction = nowFraction()
  const showNow = fraction > 0 && fraction < 1

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden" data-testid="matrix-view">
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto px-3 pb-3 pt-2">
        <div className="min-w-[1120px]">
          <div
            className="sticky top-0 z-20 grid border-b border-line bg-void-90 backdrop-blur"
            style={{ gridTemplateColumns: `176px repeat(${TOTAL_BLOCKS}, minmax(46px, 1fr))` }}
          >
            <div className="label-mono sticky left-0 z-10 border-r border-line bg-void-95 px-3 py-1.5 text-2xs text-ink-low">
              TECHNICIAN
            </div>
            {Array.from({ length: TOTAL_BLOCKS }, (_, i) => (
              <div
                key={i}
                className={cn(
                  "label-mono tnum py-1.5 text-center text-2xs",
                  i % 2 === 0 ? "text-ink-mid" : "text-ink-low"
                )}
              >
                {blockLabel(i)}
              </div>
            ))}
          </div>

          <div className="relative">
            {showNow && (
              <div
                aria-hidden
                className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-chrome-600 shadow-[0_0_8px_var(--chrome-400)]"
                style={{ left: `calc(176px + (100% - 176px) * ${fraction})` }}
              >
                <span className="absolute -top-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-chrome-600" />
              </div>
            )}
            {visibleTechs.map((tech, index) => (
              <TimelineRow
                key={tech.id}
                tech={tech}
                techIndex={index}
                jobs={visible}
                drag={drag}
                date={filters.date}
                bestSlot={bestSlot}
              />
            ))}
            {visibleTechs.length === 0 && (
              <p className="py-12 text-center text-xs text-ink-low">
                No technicians match the current team / availability filters.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
