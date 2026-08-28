"use client"

import { Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { blockLabel } from "@/lib/format"
import { rankCrews } from "@/lib/assignment"
import { useBoardStore, useJobsList } from "@/stores/boardStore"
import type { Job } from "@/types"
import { performAssignment } from "@/features/board/actions"

/**
 * SAL-style suggestion strip (research §AI Scheduling Suggestions, cloned
 * from the reference recommendation panel): picking up an unassigned task
 * reorders the interface with ranked crew recommendations. Ranking criteria
 * mirror the reference — drive time, skill match, availability, load — each
 * surfaced as its own chip. Suggest-only; the dispatcher decides.
 */
export function SuggestionStrip({ job }: { job: Job }) {
  const technicians = useBoardStore(s => s.technicians)
  const jobs = useJobsList()
  const ranked = rankCrews(job, technicians, jobs).slice(0, 3)

  return (
    <div
      data-testid="suggestion-strip"
      className="flex shrink-0 items-center gap-3 overflow-x-auto border-b border-line bg-recess/60 px-4 py-2 backdrop-blur"
    >
      <span className="label-mono inline-flex shrink-0 items-center gap-1.5 text-2xs text-ink-low">
        <Sparkles className="h-3.5 w-3.5 text-chrome-400" />
        SUGGESTED CREWS · {job.title.toUpperCase()}
      </span>
      {ranked.map(({ tech, qualified, disqualifier, todayJobs, firstFreeBlock, driveMinutes }, index) => (
        <div
          key={tech.id}
          data-testid={`suggestion-item-${tech.id}`}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-md border px-2.5 py-1.5",
            qualified ? "border-line bg-recess" : "border-urgent/30 bg-recess opacity-70"
          )}
        >
          <span className="label-mono text-2xs text-ink-low">#{index + 1}</span>
          <div className="leading-tight">
            <div className="text-xs font-semibold">{tech.name.split(" ")[0]}</div>
            <div className="label-mono tnum text-2xs text-ink-low">
              {tech.van} · {blockLabel(firstFreeBlock)}
            </div>
          </div>
          <span
            data-testid={`suggestion-drive-${tech.id}`}
            className="label-mono tnum rounded-sm bg-chrome-wash px-1.5 py-0.5 text-2xs text-chrome-600"
            title="Estimated drive from the tech's last same-day site (or the depot)"
          >
            ~{driveMinutes}M DRIVE
          </span>
          <Badge
            className={
              qualified
                ? "label-mono h-4 rounded-sm bg-complete-wash px-1 text-2xs text-complete hover:bg-complete-wash"
                : "label-mono h-4 rounded-sm bg-urgent-wash px-1 text-2xs text-urgent hover:bg-urgent-wash"
            }
          >
            {qualified ? "QUALIFIED" : disqualifier === "leave" ? "ON LEAVE" : "NO SKILL"}
          </Badge>
          <span className="label-mono tnum text-2xs text-ink-low">{todayJobs} TODAY</span>
          <Button
            variant="ghost"
            size="sm"
            data-testid={`suggestion-assign-${tech.id}`}
            disabled={!qualified}
            className="label-mono h-6 px-2 text-2xs text-chrome-400"
            onClick={() => void performAssignment(job.id, tech.id, firstFreeBlock)}
          >
            ASSIGN
          </Button>
        </div>
      ))}
      <span
        data-testid="suggestion-criteria"
        className="label-mono ml-auto shrink-0 text-2xs text-ink-low"
      >
        RANKED BY DRIVE · SKILL · AVAILABILITY · LOAD
      </span>
    </div>
  )
}
