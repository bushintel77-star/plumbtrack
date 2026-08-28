import { Siren } from 'lucide-react'
import { cn } from '@/lib/utils'
import { blockLabel, formatElapsed, TOTAL_BLOCKS } from '@/lib/format'
import { useDispatchStore } from '@/store/dispatchStore'
import type { Job } from '@/types'

interface JobBlockProps {
  job: Job
  onSelect: () => void
  onOpenDetails?: () => void
}

/**
 * Timeline block. Only a job whose status is `active` renders a live, pulsing
 * timer — every other state is deliberately muted (Single-Active-State
 * Enforcer guarantees at most one active job per technician row).
 */
export function JobBlock({ job, onSelect, onOpenDetails }: JobBlockProps): JSX.Element {
  const selectedJobId = useDispatchStore((s) => s.selectedJobId)
  const isSelected = selectedJobId === job.id
  const isActive = job.status === 'active'
  const isComplete = job.status === 'complete'

  return (
    <button
      type="button"
      data-testid={`job-block-${job.id}`}
      data-status={job.status}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onOpenDetails?.()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenDetails?.()
        }
      }}
      style={{
        left: `${(job.startBlock / TOTAL_BLOCKS) * 100}%`,
        width: `${(job.spanBlocks / TOTAL_BLOCKS) * 100}%`
      }}
      className={cn(
        'absolute inset-y-1.5 overflow-hidden rounded-md border px-2 py-1 text-left outline-none transition-colors',
        isActive
          ? 'z-[5] animate-glow-amber border-amber-500/60 bg-amber-500/[0.08]'
          : isComplete
            ? 'border-dashed border-white/15 bg-white/[0.015]'
            : 'border-white/10 bg-white/5 hover:border-primary/40 hover:bg-white/10',
        !isActive && 'opacity-60',
        isSelected && 'ring-2 ring-primary'
      )}
    >
      <div className="flex items-center gap-1">
        {job.priority === 'emergency' && (
          <Siren className="h-3 w-3 shrink-0 animate-pulse-soft text-red-400" />
        )}
        <span
          className={cn(
            'truncate text-[11px] font-medium leading-4',
            isActive ? 'text-amber-100' : 'text-zinc-300'
          )}
        >
          {job.title}
        </span>
      </div>

      {isActive ? (
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse-soft rounded-full bg-amber-400" />
          <span
            data-testid={`timer-${job.id}`}
            className="tnum text-[13px] font-semibold leading-4 tracking-wide text-amber-400"
          >
            {formatElapsed(job.elapsedSeconds)}
          </span>
        </div>
      ) : isComplete ? (
        <span className="tnum mt-0.5 block text-[10px] leading-4 text-zinc-500">
          {formatElapsed(job.elapsedSeconds)} · DONE
        </span>
      ) : (
        <span className="tnum mt-0.5 block text-[10px] leading-4 text-zinc-500">
          {blockLabel(job.startBlock)} · QUEUED
        </span>
      )}
    </button>
  )
}
