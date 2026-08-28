"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { useQueryState, parseAsString } from "nuqs"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import {
  blockLabel,
  dayLabel,
  isoDay,
  todayIsoDay,
  TOTAL_BLOCKS
} from "@/lib/format"
import { useBoardStore, useJobsList } from "@/stores/boardStore"

import type { BoardFilters } from "@/features/board/filters"
import { jobMatchesFilters } from "@/features/board/filters"

const ROW_HEIGHT = 30

const PERSON_TEXT = ["text-person-1", "text-person-2", "text-person-3", "text-person-4"]

function shiftDay(isoDayString: string, delta: number): string {
  const d = new Date(`${isoDayString}T12:00:00`)
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

/** Calendar view — vertical day timeline with proportional job blocks
 *  (research §View topology: "time-bound blocks on a vertical timeline").
 *  Respects the shared filter contract like every other view. */
export function CalendarView({ filters }: { filters: BoardFilters }) {
  const jobs = useJobsList()
  const technicians = useBoardStore(s => s.technicians)
  const selectJob = useBoardStore(s => s.selectJob)
  const selectedJobId = useBoardStore(s => s.selectedJobId)
  const [date, setDate] = useQueryState("date", parseAsString.withDefault(todayIsoDay()))

  const visible = jobs.filter(
    j => (!j.scheduledDate || j.scheduledDate === date) && jobMatchesFilters(j, filters)
  )
  const isToday = date === todayIsoDay()
  const now = new Date()
  const nowRow =
    ((now.getHours() * 60 + now.getMinutes() - 8 * 60) / 30) * ROW_HEIGHT

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="calendar-view">
      <div className="flex shrink-0 items-center gap-2 px-4 py-2.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Previous day"
          data-testid="day-prev"
          onClick={() => void setDate(shiftDay(date, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="label-mono text-xs text-ink-mid" data-testid="day-label">
          {dayLabel(date)} {isToday && "· TODAY"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Next day"
          data-testid="day-next"
          onClick={() => void setDate(shiftDay(date, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="label-mono ml-auto text-2xs text-ink-low">
          SELECT A BLOCK, THEN OPEN DISPATCH TO INSPECT
        </span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="min-w-[820px] px-4 pb-6">
          {/* Column headers */}
          <div
            className="sticky top-0 z-10 grid border-b border-line bg-chrome-void/95 backdrop-blur"
            style={{ gridTemplateColumns: `64px repeat(${technicians.length}, minmax(168px, 1fr))` }}
          >
            <div />
            {technicians.map((tech, i) => (
              <div key={tech.id} className="px-3 py-2">
                <div className={cn("text-xs font-bold", PERSON_TEXT[i % 4])}>
                  {tech.name.split(" ")[0]}
                </div>
                <div className="label-mono text-2xs text-ink-low">{tech.van}</div>
              </div>
            ))}
          </div>

          {/* Time grid */}
          <div
            className="relative grid"
            style={{
              gridTemplateColumns: `64px repeat(${technicians.length}, minmax(168px, 1fr))`,
              height: TOTAL_BLOCKS * ROW_HEIGHT
            }}
          >
            {/* Hour gutters + row rules */}
            {Array.from({ length: TOTAL_BLOCKS }, (_, i) => (
              <div
                key={i}
                className="label-mono border-t border-line/60 pr-2 pt-0.5 text-right text-2xs text-ink-low"
                style={{ gridColumn: "1", gridRow: `${i + 1} / span 1` }}
              >
                {i % 2 === 0 ? blockLabel(i) : ""}
              </div>
            ))}

            {isToday && nowRow >= 0 && nowRow <= TOTAL_BLOCKS * ROW_HEIGHT && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 z-10 h-px bg-active"
                style={{ top: nowRow }}
              >
                <span className="absolute -left-1 -top-[3px] h-[7px] w-[7px] rounded-full bg-active" />
              </div>
            )}

            {/* Job blocks per tech column */}
            {technicians.map((tech, colIndex) => {
              const columnJobs = visible.filter(j => j.techId === tech.id)
              return (
                <div
                  key={tech.id}
                  className="relative border-l border-line/60"
                  style={{ gridColumn: `${colIndex + 2}`, gridRow: `1 / span ${TOTAL_BLOCKS}` }}
                >
                  {columnJobs.map(job => {
                    const isActive = job.status === "active"
                    const isComplete = job.status === "complete"
                    return (
                      <button
                        key={job.id}
                        data-testid={`cal-block-${job.id}`}
                        data-status={job.status}
                        onClick={() => selectJob(job.id)}
                        style={{
                          top: job.startBlock * ROW_HEIGHT + 2,
                          height: job.spanBlocks * ROW_HEIGHT - 4
                        }}
                        className={cn(
                          "absolute inset-x-1.5 overflow-hidden rounded-md border px-2 py-1 text-left transition-colors",
                          isActive
                            ? "z-[5] animate-glow-active border-active bg-active-wash"
                            : isComplete
                              ? "border-complete bg-complete-wash"
                              : "border-line bg-recess hover:border-chrome-400/50",
                          selectedJobId === job.id && "ring-2 ring-chrome-400",
                          !isActive && !isComplete && "opacity-80"
                        )}
                      >
                        <div className="truncate text-[11px] font-semibold leading-4">
                          {job.title}
                        </div>
                        <div className="label-mono tnum text-2xs font-semibold leading-4 text-ink-mid">
                          {blockLabel(job.startBlock)}–{blockLabel(job.startBlock + job.spanBlocks)}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
