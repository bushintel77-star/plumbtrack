import type { DragEvent } from 'react'
import { Clock, GripVertical, Siren } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useDispatchStore } from '@/store/dispatchStore'
import { MINUTES_PER_BLOCK } from '@/lib/format'

export const JOB_DRAG_MIME = 'application/x-fieldloop-job'

export function UnassignedQueue({ onOpenDetails }: { onOpenDetails?: (jobId: string) => void }): JSX.Element {
  const jobs = useDispatchStore((s) => s.jobs)
  const selectJob = useDispatchStore((s) => s.selectJob)
  const selectedJobId = useDispatchStore((s) => s.selectedJobId)
  const queue = jobs.filter((j) => j.status === 'unassigned')
  const hasEmergency = queue.some((j) => j.priority === 'emergency')

  return (
    <section className="dispatch-surface flex min-h-0 flex-[1.1] flex-col overflow-hidden rounded-xl">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Unassigned Queue
        </h2>
        <Badge
          variant="outline"
          className={cn(
            'tnum h-5 rounded-full px-1.5 text-[10px]',
            hasEmergency
              ? 'border-destructive/40 bg-destructive/10 text-red-400'
              : 'border-white/10 bg-white/[0.04] text-muted-foreground'
          )}
        >
          {queue.length} waiting
        </Badge>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 p-2.5" data-testid="unassigned-queue">
          {queue.length === 0 && (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground">
              Queue clear — every job is dispatched.
            </p>
          )}
          {queue.map((job) => (
            <div
              key={job.id}
              draggable
              data-testid={`queue-card-${job.id}`}
              onDragStart={(e: DragEvent<HTMLDivElement>) => {
                e.dataTransfer.setData(JOB_DRAG_MIME, job.id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onClick={() => selectJob(job.id)}
              onDoubleClick={() => onOpenDetails?.(job.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDetails?.(job.id) } }}
              tabIndex={0}
              className={cn(
                'group relative cursor-grab overflow-hidden rounded-xl border border-white/10 bg-white/5 p-3 pl-3 transition-colors backdrop-blur-[16px] active:cursor-grabbing',
                job.priority === 'emergency'
                  ? 'border-destructive/30 hover:border-destructive/50'
                  : 'border-white/[0.08] hover:border-primary/40',
                selectedJobId === job.id && 'ring-2 ring-primary'
              )}
            >
              <span
                className={cn(
                  'absolute inset-y-0 left-0 w-[3px]',
                  job.priority === 'emergency'
                    ? 'bg-red-500'
                    : job.priority === 'high'
                      ? 'bg-primary'
                      : 'bg-white/20'
                )}
              />
              <div className="flex min-h-[62px] items-start gap-2">
                <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {job.priority === 'emergency' && (
                      <Siren className="h-3.5 w-3.5 shrink-0 animate-pulse-soft text-red-400" />
                    )}
                    <span className="truncate text-[13px] font-medium">{job.title}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{job.client}</div>
                  <div className="tnum mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    ~{((job.spanBlocks * MINUTES_PER_BLOCK) / 60).toFixed(1)}h · {job.id.toUpperCase()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="border-t border-white/[0.06] px-3 py-1.5 text-center text-[10px] text-muted-foreground">
        Drag a card onto a technician row to dispatch
      </div>
    </section>
  )
}
