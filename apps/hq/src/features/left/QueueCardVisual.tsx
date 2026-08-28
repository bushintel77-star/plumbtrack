"use client"

import { Clock, GripVertical, Siren } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { MINUTES_PER_BLOCK } from "@/lib/format"
import type { Job } from "@/types"

export function QueueCardVisual({ job, floating }: { job: Job; floating?: boolean }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border bg-recess p-2.5 pl-3.5",
        job.priority === "emergency" ? "border-urgent/40" : "border-line",
        floating && "w-64 rotate-1 shadow-chassis ring-2 ring-chrome-400"
      )}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-[3px]",
          job.priority === "emergency"
            ? "bg-urgent"
            : job.priority === "high"
              ? "bg-chrome-400"
              : "bg-edge"
        )}
      />
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-low" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {job.priority === "emergency" && (
              <Siren className="h-3.5 w-3.5 shrink-0 animate-pulse-soft text-urgent" />
            )}
            <span className="truncate text-[13px] font-semibold">{job.title}</span>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-ink-mid">{job.client}</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="label-mono tnum flex items-center gap-1 text-2xs text-ink-low">
              <Clock className="h-3 w-3" />
              ~{((job.spanBlocks * MINUTES_PER_BLOCK) / 60).toFixed(1)}H
            </span>
            <span className="label-mono text-2xs text-ink-low">{job.id.toUpperCase()}</span>
            {job.requiredSkill && (
              <Badge className="label-mono h-4 rounded-sm border border-chrome-400/40 bg-chrome-wash px-1 text-2xs text-chrome-400 hover:bg-chrome-wash">
                {job.requiredSkill}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
