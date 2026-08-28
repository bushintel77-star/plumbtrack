"use client"

import { useDraggable } from "@dnd-kit/core"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useBoardStore, useJobsList } from "@/stores/boardStore"
import type { Job } from "@/types"

import { QueueCardVisual } from "./QueueCardVisual"

function DraggableQueueCard({ job }: { job: Job }) {
  const selectedJobId = useBoardStore(s => s.selectedJobId)
  const openDetails = useBoardStore(s => s.openDetails)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: job.id,
    // Data payload for the timeline: duration drives block width on hover
    // (research §Phase 2 — draggable queue data property).
    data: { jobId: job.id, spanBlocks: job.spanBlocks }
  })

  return (
    <div
      ref={setNodeRef}
      data-testid={`queue-card-${job.id}`}
      {...listeners}
      {...attributes}
      onClick={() => openDetails(job.id)}
      className={cn(
        "cursor-grab touch-none transition-opacity active:cursor-grabbing",
        isDragging && "opacity-30",
        selectedJobId === job.id && "[&>div]:ring-2 [&>div]:ring-chrome-400"
      )}
    >
      <QueueCardVisual job={job} />
    </div>
  )
}

/** Unassigned queue — drag source for the crew view; click opens details. */
export function QueueRail({ date }: { date: string }) {
  const jobs = useJobsList()
  const queue = jobs.filter(
    j => j.status === "unassigned" && (!j.scheduledDate || j.scheduledDate === date)
  )

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 p-3" data-testid="unassigned-queue">
          {queue.length === 0 && (
            <p className="px-1 py-6 text-center text-xs text-ink-low">
              Queue clear — every job is dispatched.
            </p>
          )}
          {queue.map(job => (
            <DraggableQueueCard key={job.id} job={job} />
          ))}
        </div>
      </ScrollArea>
      <div className="label-mono border-t border-line px-3 py-1.5 text-center text-2xs text-ink-low">
        DRAG ONTO A ROW, OR PICK UP FOR SUGGESTIONS
      </div>
    </div>
  )
}
