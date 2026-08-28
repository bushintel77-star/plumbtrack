"use client"

import { CalendarDays, ChevronLeft, ChevronRight, FilterX, Route } from "lucide-react"
import { useQueryState, parseAsString } from "nuqs"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { dayLabel } from "@/lib/format"
import { useBoardStore } from "@/stores/boardStore"

import { FilterPopover } from "./FilterPopover"
import { AvailabilityPanel } from "./AvailabilityPanel"
import { hasActiveFilters, type BoardFilters } from "./filters"

function shiftDay(isoDayString: string, delta: number): string {
  const d = new Date(`${isoDayString}T12:00:00`)
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

const ZOOMS = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" }
] as const

export interface FilterBarProps {
  filters: BoardFilters
  onFiltersChange: (patch: Partial<BoardFilters & { zoom: string }>) => void
  zoom: string
}

/** Board toolbar: zoom controls + day scrubber (daily) + the global filter
 *  popover and one-click clear. The popover replaces the old flat selects —
 *  every dimension now lives in the URL as shareable state. */
export function FilterBar({ filters, onFiltersChange, zoom }: FilterBarProps) {
  const active = hasActiveFilters(filters)
  const setOptimizerOpen = useBoardStore(s => s.setOptimizerOpen)
  const optimizerOpen = useBoardStore(s => s.optimizerOpen)

  return (
    <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-line bg-recess/60 px-4 backdrop-blur">
      {/* Zoom */}
      <div
        className="flex items-center rounded-md border border-line bg-recess p-0.5"
        role="tablist"
        aria-label="Timeline zoom"
      >
        {ZOOMS.map(z => (
          <button
            key={z.id}
            role="tab"
            aria-selected={zoom === z.id}
            data-testid={`zoom-${z.id}`}
            onClick={() => onFiltersChange({ zoom: z.id })}
            className={cn(
              "label-mono h-6 rounded-[5px] px-2.5 text-2xs font-semibold transition-colors",
              zoom === z.id ? "btn-primary text-on-accent" : "text-ink-mid hover:text-ink"
            )}
          >
            {z.label}
          </button>
        ))}
      </div>

      {zoom === "daily" && (
        <>
          <div className="h-5 w-px bg-line" />
          {/* Day scrubber */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Previous day"
              data-testid="day-prev"
              onClick={() => onFiltersChange({ date: shiftDay(filters.date, -1) })}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span
              className="label-mono flex items-center gap-1.5 text-xs text-ink-mid"
              data-testid="day-label"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              {dayLabel(filters.date)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Next day"
              data-testid="day-next"
              onClick={() => onFiltersChange({ date: shiftDay(filters.date, 1) })}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}

      <div className="ml-auto flex items-center gap-2">
        <AvailabilityPanel date={filters.date} />
        <Button
          variant="outline"
          size="sm"
          data-testid="optimizer-trigger"
          aria-label="Open route optimizer"
          className={cn(
            "label-mono h-8 gap-1.5 border-line bg-recess px-2.5 text-2xs",
            optimizerOpen
              ? "border-chrome-600 text-chrome-600"
              : "text-ink-mid hover:text-ink"
          )}
          onClick={() => setOptimizerOpen(!optimizerOpen)}
        >
          <Route className="h-3.5 w-3.5" />
          ROUTE OPT
        </Button>
        <FilterPopover />
        {active && (
          <Button
            variant="ghost"
            size="sm"
            data-testid="filter-clear"
            className="label-mono h-7 gap-1 px-2 text-2xs text-urgent hover:text-urgent"
            onClick={() =>
              onFiltersChange({
                status: [],
                skill: [],
                region: [],
                jobType: [],
                team: [],
                availableOnly: false
              })
            }
          >
            <FilterX className="h-3.5 w-3.5" />
            CLEAR
          </Button>
        )}
      </div>
    </div>
  )
}
