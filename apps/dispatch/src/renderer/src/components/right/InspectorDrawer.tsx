import { ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useDispatchStore } from '@/store/dispatchStore'
import { blockLabel } from '@/lib/format'
import { TimerControl } from './TimerControl'
import { DocumentVault } from './DocumentVault'
import { QuotePanel } from './QuotePanel'

const PRIORITY_BADGE: Record<string, string> = {
  emergency: 'bg-destructive/15 text-red-400 hover:bg-destructive/15',
  high: 'bg-primary/15 text-blue-400 hover:bg-primary/15',
  normal: 'bg-white/[0.05] text-muted-foreground hover:bg-white/[0.05]'
}

export function InspectorDrawer({ onOpenDetails }: { onOpenDetails?: () => void }): JSX.Element {
  const jobs = useDispatchStore((s) => s.jobs)
  const technicians = useDispatchStore((s) => s.technicians)
  const selectedJobId = useDispatchStore((s) => s.selectedJobId)
  const assignJob = useDispatchStore((s) => s.assignJob)
  const job = jobs.find((j) => j.id === selectedJobId)

  if (!job) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="glass max-w-[220px] rounded-lg p-5 text-center">
          <ClipboardList className="mx-auto h-6 w-6 text-muted-foreground/60" />
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Live Inspector — select a job on the dispatch canvas or in the queue to inspect its
            timer, compliance vault and quote.
          </p>
        </div>
      </div>
    )
  }

  const tech = technicians.find((t) => t.id === job.techId)

  return (
    <ScrollArea className="h-full">
      <div data-testid={`inspector-${job.id}`} className="space-y-3 bg-[#0B1120] p-3">
        <section className="dispatch-surface rounded-xl p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-sm font-semibold leading-tight">{job.title}</h2>
            <Badge
              className={cn(
                'shrink-0 rounded-sm text-[9px] font-bold uppercase tracking-widest',
                PRIORITY_BADGE[job.priority]
              )}
            >
              {job.priority}
            </Badge>
          </div>
          <Button type="button" size="sm" onClick={onOpenDetails} className="mt-3 w-full">Open Full Job Details <span className="ml-auto text-[10px] opacity-70">Space / ↵</span></Button>

          <div className="tnum mt-3 text-[10px] uppercase tracking-wider text-muted-foreground">
            {job.id} · {job.status}
          </div>

          <div className="mt-3 space-y-1 text-[12px] leading-relaxed">
            <div className="text-zinc-300">{job.client}</div>
            <div className="text-muted-foreground">{job.address}</div>
          </div>

          <div className="mt-3">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Assigned technician
            </label>
            <select
              data-testid="tech-select"
              value={job.techId ?? ''}
              onChange={(e) => { assignJob(job.id, e.target.value, job.startBlock) }}
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 text-[12px] text-foreground outline-none backdrop-blur-[16px] focus:border-primary/60"
            >
              <option value="" disabled>
                Unassigned
              </option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id} className="bg-[#141821]">
                  {t.name} — {t.van}
                </option>
              ))}
            </select>
            {tech && (
              <p className="tnum mt-1 text-[10px] text-muted-foreground">
                Slot {blockLabel(job.startBlock)} → {blockLabel(job.startBlock + job.spanBlocks)}
              </p>
            )}
          </div>
        </section>

        <TimerControl job={job} />
        <DocumentVault documents={job.documents} />
        <QuotePanel job={job} />
      </div>
    </ScrollArea>
  )
}
