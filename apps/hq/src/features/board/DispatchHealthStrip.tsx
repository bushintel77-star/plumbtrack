"use client"

import { AlertTriangle, Clock3, Radio, Siren } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Job } from "@/types"

interface DispatchHealthStripProps {
  jobs: Job[]
  routeRiskCount: number
  onFilter: (status: Job["status"] | "route-risk" | null) => void
}

export function DispatchHealthStrip({ jobs, routeRiskCount, onFilter }: DispatchHealthStripProps) {
  const active = jobs.filter(job => job.status === "active").length
  const unassigned = jobs.filter(job => job.status === "unassigned").length
  const delayed = jobs.filter(job => job.status === "delayed").length
  const metrics = [
    { key: "active" as const, label: "Billing now", value: active, icon: Radio, tone: "text-active", detail: "active jobs" },
    { key: "unassigned" as const, label: "Needs dispatch", value: unassigned, icon: Siren, tone: "text-urgent", detail: "unassigned" },
    { key: "delayed" as const, label: "At risk", value: delayed, icon: Clock3, tone: "text-pending", detail: "delayed jobs" },
    { key: "route-risk" as const, label: "Route gaps", value: routeRiskCount, icon: AlertTriangle, tone: "text-pending", detail: "tight transitions" }
  ]

  return (
    <section aria-label="Dispatch health" className="flex shrink-0 items-center gap-2 border-b border-line bg-void-90 px-4 py-2">
      <span className="label-mono mr-1 shrink-0 text-2xs text-ink-low">SHIFT PULSE</span>
      {metrics.map(metric => {
        const Icon = metric.icon
        return (
          <button
            key={metric.key}
            type="button"
            onClick={() => onFilter(metric.key === "route-risk" ? "route-risk" : metric.key)}
            aria-label={`${metric.label}: ${metric.value} ${metric.detail}`}
            className={cn("flex min-w-[116px] items-center gap-2 rounded-md border border-line bg-fill px-2.5 py-1.5 text-left transition-colors hover:border-chrome-400/60 hover:bg-chrome-wash focus-visible:ring-2 focus-visible:ring-chrome-400", metric.value > 0 && metric.tone)}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              <span className="label-mono block truncate text-[9px] text-ink-low">{metric.label}</span>
              <span className="tnum block text-sm font-bold leading-4">{metric.value}</span>
            </span>
          </button>
        )
      })}
      <span className="ml-auto hidden label-mono text-2xs text-ink-low xl:block">SELECT A SIGNAL TO FILTER THE BOARD</span>
    </section>
  )
}
