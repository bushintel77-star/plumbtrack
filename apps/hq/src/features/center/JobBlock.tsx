"use client"

import { useDraggable } from "@dnd-kit/core"
import { AlertTriangle } from "lucide-react"
import { statusStyleFor } from "@/lib/statusStyles"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from "@/components/ui/context-menu"
import { cn } from "@/lib/utils"
import { blockLabel, formatElapsed, TOTAL_BLOCKS } from "@/lib/format"
import { jobConflicts } from "@/lib/schedule"
import { useBoardStore, useJobsList } from "@/stores/boardStore"
import type { Job, JobStatus } from "@/types"

/**
 * Timeline block — a live broadcast of job health (research §Dynamic
 * Highlight Job Blocks). Status decides stripe, wash and iconography
 * pre-attentively; conflicts (overlap / skill / transit) add a pulsing red
 * ring + hash overlay; right-click overrides status in place; and the block
 * itself is draggable onto other rows with full constraint validation.
 */
export function JobBlock({ job, onSelect }: { job: Job; onSelect: (jobId: string) => void }) {
  const selectedJobId = useBoardStore(s => s.selectedJobId)
  const jobs = useJobsList()
  const technicians = useBoardStore(s => s.technicians)
  const setJobStatus = useBoardStore(s => s.setJobStatus)

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `block:${job.id}`
  })

  const isSelected = selectedJobId === job.id
  const isActive = job.status === "active"
  const isComplete = job.status === "complete"
  const conflicts = jobConflicts(job, jobs, technicians)
  const status = statusStyleFor(job)
  const StatusIcon = status.icon
  const hasConflict = conflicts.length > 0
  // Conflict overrides the wash with solid urgent + pulsing ring — an overlap
  // must read as a fault, not just another tint.
  const block = hasConflict ? "bg-urgent text-on-accent border-l-[3px] border-l-black/25" : status.block
  const tone = hasConflict ? "text-on-accent" : status.blockTone

  const statusItem = (value: JobStatus, label: string): React.ReactNode => (
    <ContextMenuRadioItem
      value={value}
      onSelect={() => setJobStatus(job.id, value)}
      className="label-mono text-2xs"
    >
      {label}
    </ContextMenuRadioItem>
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          ref={setNodeRef}
          {...listeners}
          {...attributes}
          type="button"
          data-testid={`job-block-${job.id}`}
          data-status={job.status}
          data-conflict={hasConflict}
          title={hasConflict ? conflicts.join(" · ") : undefined}
          onClick={e => {
            e.stopPropagation()
            onSelect(job.id)
          }}
          style={{
            left: `${(job.startBlock / TOTAL_BLOCKS) * 100}%`,
            width: `${(job.spanBlocks / TOTAL_BLOCKS) * 100}%`
          }}
          className={cn(
            "absolute inset-y-2.5 touch-none overflow-hidden rounded-[7px] border-l-[3px] px-2 py-0 text-left outline-none transition-[filter,transform,opacity]",
            block,
            hasConflict && "z-[6] animate-pulse-soft ring-2 ring-urgent",
            !isActive && !isComplete && "opacity-95",
            isSelected && "ring-2 ring-chrome-400 ring-offset-1 ring-offset-void",
            isDragging && "opacity-40",
            "hover:brightness-[1.03]"
          )}
        >
          {hasConflict && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 [background-image:repeating-linear-gradient(45deg,var(--wash-urgent)_0_5px,transparent_5px_10px)]"
            />
          )}

          <div className="relative flex min-w-0 flex-col justify-center gap-0">
            <span className={cn("label-mono tnum text-[10px] leading-3", tone)}>
              {blockLabel(job.startBlock)}–{blockLabel(job.startBlock + job.spanBlocks)}
            </span>
            <span className="flex items-center gap-1">
              {hasConflict ? <AlertTriangle className="h-3 w-3 shrink-0" /> : <StatusIcon className={cn("h-3 w-3 shrink-0", tone)} />}
              <span className="truncate text-[11px] font-bold leading-4">{job.title}</span>
              <span className="sr-only">{status.label}</span>
            </span>
          </div>
          {isActive && <span data-testid={`timer-${job.id}`} className="sr-only">{formatElapsed(job.elapsedSeconds)}</span>}
        </button>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuLabel>RAPID STATUS OVERRIDE</ContextMenuLabel>
        <ContextMenuRadioGroup value={job.status}>
          {statusItem("scheduled", "SCHEDULED")}
          {statusItem("en_route", "EN ROUTE")}
          {statusItem("active", "IN PROGRESS")}
          {statusItem("delayed", "DELAYED")}
          {statusItem("complete", "COMPLETED")}
        </ContextMenuRadioGroup>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onSelect(job.id)} className="label-mono text-2xs">
          OPEN DETAILS…
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
