"use client"

import { useDraggable } from "@dnd-kit/core"
import {
  AlertTriangle
} from "lucide-react"

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
  const isEnRoute = job.status === "en_route"
  const isDelayed = job.status === "delayed"
  const conflicts = jobConflicts(job, jobs, technicians)
  const hasConflict = conflicts.length > 0

  const stripe = hasConflict ? "bg-white/45" : "bg-black/20"
  const chip = hasConflict
    ? "bg-[#dc2626]"
    : isActive
      ? "bg-[#2563eb]"
      : isComplete
        ? "bg-[#64748b]"
        : isDelayed
          ? "bg-[#f59e0b]"
          : job.priority === "emergency"
            ? "bg-[#dc2626]"
            : "bg-[#0089f6]"

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
            "absolute inset-y-2.5 touch-none overflow-hidden rounded-[3px] px-2 py-0 text-left text-white outline-none transition-[filter,transform,opacity]",
            chip,
            hasConflict && "z-[6] animate-pulse-soft ring-2 ring-red-300",
            !isActive && !isComplete && "opacity-95",
            isSelected && "ring-2 ring-white ring-offset-1 ring-offset-slate-950",
            isDragging && "opacity-40",
            "hover:brightness-110"
          )}
        >
          <span className={cn("absolute inset-y-0 left-0 w-[3px]", stripe)} />
          {hasConflict && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 [background-image:repeating-linear-gradient(45deg,var(--wash-urgent)_0_5px,transparent_5px_10px)]"
            />
          )}

          <div className="relative flex min-w-0 items-center gap-1">
            <span className={cn("absolute inset-y-0 -left-2 w-0.5", stripe)} />
            {hasConflict && <AlertTriangle className="h-3 w-3 shrink-0 text-white" />}
            <span className="truncate text-[11px] font-bold leading-4 text-white">{job.status === "en_route" ? "EN ROUTE" : job.status === "delayed" ? "DELAYED" : job.status === "complete" ? "DONE" : job.id.replace("j-", "Job #")}</span>
            {job.status === "scheduled" && <span className="sr-only">QUEUED</span>}
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
