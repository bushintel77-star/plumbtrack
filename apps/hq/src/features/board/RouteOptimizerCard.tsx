"use client"

import { useMemo, useState } from "react"
import { ArrowRight, Minus, Plus, Route, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { blockLabel } from "@/lib/format"
import {
  optimizeRoutes,
  type OptimizeConfig,
  type OptimizeResult
} from "@/lib/optimize"
import { useBoardStore, useJobsList } from "@/stores/boardStore"
import { performRouteApply } from "./actions"

/** Stepper exactly like the reference: a numeric knob with +/- controls. */
function Stepper({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
  testId
}: {
  label: string
  value: number
  min: number
  max: number
  suffix?: string
  onChange: (value: number) => void
  testId: string
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-xs text-ink-mid">{label}</span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          data-testid={`${testId}-dec`}
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          className="h-6 w-6 border-line bg-recess"
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <span
          data-testid={testId}
          className="label-mono tnum w-14 text-center text-xs font-semibold"
        >
          {String(value).padStart(2, "0")}
          {suffix}
        </span>
        <Button
          variant="outline"
          size="icon"
          data-testid={`${testId}-inc`}
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          className="h-6 w-6 border-line bg-recess"
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

/**
 * Route Optimizer card (research §Efficient Route, cloned from the reference
 * configuration card): scope + max routes / tasks / duration knobs, then a
 * nearest-neighbour run that respects skills, absences, the board day and
 * travel legs. Applying writes the whole day atomically — the canvas travel
 * bands light up with real gaps between stops.
 */
export function RouteOptimizerCard({ date }: { date: string }) {
  const open = useBoardStore(s => s.optimizerOpen)
  const setOpen = useBoardStore(s => s.setOptimizerOpen)
  const technicians = useBoardStore(s => s.technicians)
  const jobs = useJobsList()

  const [config, setConfig] = useState<OptimizeConfig>({
    scope: "unassigned",
    maxRoutes: 3,
    maxTasksPerRoute: 8,
    maxHoursPerRoute: 8
  })
  const [result, setResult] = useState<OptimizeResult | null>(null)

  const eligibleCount = useMemo(
    () =>
      technicians.filter(t => !t.absences.some(a => date >= a.from && date <= a.to))
        .length,
    [technicians, date]
  )

  if (!open) return null

  const run = (): void => {
    setResult(optimizeRoutes(date, jobs, technicians, config))
  }

  const apply = async (): Promise<void> => {
    if (!result) return
    const ok = await performRouteApply(result)
    if (ok) setOpen(false)
  }

  return (
    <aside
      data-testid="route-optimizer"
      className="panel-strong absolute right-0 top-0 z-30 flex h-full w-[340px] flex-col border-l border-line shadow-[var(--chassis-shadow)]"
      aria-label="Route optimizer"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-chrome-wash text-chrome-400">
            <Route className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <div className="text-[13px] font-bold">Route Optimizer</div>
            <div className="label-mono text-2xs text-ink-low">
              TRAVEL-AWARE DAY PLAN
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Close route optimizer"
          data-testid="route-optimizer-close"
          onClick={() => setOpen(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {/* ── Configuration (reference card controls) ─────────────────── */}
        <section data-testid="opt-config" className="space-y-1">
          <div className="label-mono text-2xs text-ink-low">OPTIMIZE</div>
          <div
            className="flex items-center rounded-md border border-line bg-recess p-0.5"
            role="tablist"
            aria-label="Optimize scope"
          >
            {(
              [
                { id: "unassigned", label: "UNASSIGNED TASKS" },
                { id: "all", label: "ALL TASKS" }
              ] as const
            ).map(option => (
              <button
                key={option.id}
                role="tab"
                aria-selected={config.scope === option.id}
                data-testid={`opt-scope-${option.id}`}
                onClick={() => {
                  setConfig(c => ({ ...c, scope: option.id }))
                  setResult(null)
                }}
                className={cn(
                  "label-mono h-6 flex-1 rounded-[5px] px-2 text-2xs font-semibold transition-colors",
                  config.scope === option.id
                    ? "btn-primary text-on-accent"
                    : "text-ink-mid hover:text-ink"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <Stepper
            label="Max num of routes to create"
            value={config.maxRoutes}
            min={1}
            max={Math.max(1, eligibleCount)}
            onChange={v => {
              setConfig(c => ({ ...c, maxRoutes: v }))
              setResult(null)
            }}
            testId="opt-max-routes"
          />
          <Stepper
            label="Max num of tasks per route"
            value={config.maxTasksPerRoute}
            min={1}
            max={40}
            onChange={v => {
              setConfig(c => ({ ...c, maxTasksPerRoute: v }))
              setResult(null)
            }}
            testId="opt-max-tasks"
          />
          <Stepper
            label="Maximum duration per route"
            value={config.maxHoursPerRoute}
            min={1}
            max={10}
            suffix=" HRS"
            onChange={v => {
              setConfig(c => ({ ...c, maxHoursPerRoute: v }))
              setResult(null)
            }}
            testId="opt-max-hours"
          />
          <Button
            size="sm"
            data-testid="opt-run"
            className="btn-primary label-mono mt-2 h-7 w-full text-2xs"
            onClick={run}
          >
            OPTIMIZE
          </Button>
        </section>

        {/* ── Results ─────────────────────────────────────────────────── */}
        {result && (
          <section data-testid="opt-results" className="mt-4 space-y-2">
            <div className="label-mono text-2xs text-ink-low">
              {result.routes.length} ROUTE{result.routes.length === 1 ? "" : "S"} ·{" "}
              {result.routes.reduce((n, r) => n + r.stops.length, 0)} STOPS
            </div>
            {result.routes.map(route => (
              <div
                key={route.techId}
                data-testid={`route-card-${route.techId}`}
                className="panel space-y-1.5 rounded-lg p-2.5"
              >
                <div className="flex items-center justify-between">
                  <div className="leading-tight">
                    <div className="text-xs font-semibold">
                      {route.techName.split(" ")[0]} · {route.van}
                    </div>
                    <div className="label-mono tnum text-2xs text-ink-low">
                      {route.stops.length} TASKS · {route.workMinutes / 60}H WORK · ~
                      {route.travelMinutes}M TRAVEL
                    </div>
                  </div>
                  <span
                    className="label-mono tnum rounded-sm bg-chrome-wash px-1.5 py-0.5 text-2xs text-chrome-600"
                    title="Route duration vs the configured budget"
                  >
                    {Math.round((route.totalMinutes / (config.maxHoursPerRoute * 60)) * 100)}%
                  </span>
                </div>
                <ol className="space-y-1">
                  {route.stops.map((stop, i) => (
                    <li
                      key={stop.jobId}
                      data-testid={`route-stop-${route.techId}-${stop.jobId}`}
                      className={cn(
                        "flex items-center gap-2 rounded border px-1.5 py-1 text-2xs",
                        stop.isNew
                          ? "border-chrome-400/40 bg-chrome-wash/50"
                          : "border-line bg-recess"
                      )}
                    >
                      <span className="label-mono tnum w-3 text-ink-low">{i + 1}</span>
                      {i > 0 && (
                        <span className="label-mono tnum text-2xs text-chrome-600">
                          <ArrowRight className="h-3 w-3" />
                          {stop.travelFromPrevMin}M
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {stop.title}
                      </span>
                      <span className="label-mono tnum text-ink-low">
                        {blockLabel(stop.startBlock)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}

            {result.unplaced.map(u => (
              <div
                key={u.jobId}
                data-testid={`opt-unplaced-${u.jobId}`}
                className="rounded border border-urgent/40 bg-urgent-wash px-2 py-1.5 text-2xs text-urgent"
              >
                <span className="font-semibold">{u.title}</span> — {u.reason}
              </div>
            ))}

            <Button
              size="sm"
              data-testid="opt-apply"
              disabled={result.routes.length === 0}
              className="btn-primary label-mono h-7 w-full text-2xs"
              onClick={() => void apply()}
            >
              APPLY TO BOARD
            </Button>
          </section>
        )}
      </div>
    </aside>
  )
}
