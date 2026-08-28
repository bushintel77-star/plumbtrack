import { Play, Square } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { formatElapsed } from '@/lib/format'
import { useDispatchStore } from '@/store/dispatchStore'
import { useToast } from '@/hooks/use-toast'
import type { Job } from '@/types'

export function TimerControl({ job }: { job: Job }): JSX.Element {
  const clockOn = useDispatchStore((s) => s.clockOn)
  const clockOff = useDispatchStore((s) => s.clockOff)
  const technicians = useDispatchStore((s) => s.technicians)
  const { toast } = useToast()

  const tech = technicians.find((t) => t.id === job.techId)
  const isActive = job.status === 'active'
  const canClockOn = Boolean(job.techId) && !isActive
  const canClockOff = isActive

  const handleClockOn = (): void => {
    const { demoted } = clockOn(job.id)
    toast({
      title: `Clocked on — ${job.title}`,
      description:
        demoted.length > 0
          ? `Single-active rule enforced: ${demoted.length} sibling job${demoted.length > 1 ? 's' : ''} on ${tech?.name.split(' ')[0] ?? 'this tech'} muted to QUEUED.`
          : `Timer restarted at 00:00:00 on ${tech?.name.split(' ')[0] ?? 'technician'}'s row.`
    })
  }

  const handleClockOff = (): void => {
    clockOff(job.id)
    toast({
      title: `Clocked off — ${job.title}`,
      description: `Final on-site time frozen at ${formatElapsed(job.elapsedSeconds)}.`
    })
  }

  return (
    <section className="dispatch-surface rounded-xl p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Active Timer
        </h3>
        {isActive ? (
          <Badge className="animate-pulse-soft rounded-full dispatch-status-active text-[9px] font-bold uppercase tracking-wide hover:bg-transparent">
            Running
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="rounded-sm border-white/10 bg-white/[0.03] text-[9px] font-bold uppercase tracking-wide text-muted-foreground"
          >
            {job.status === 'complete' ? 'Complete' : 'Idle'}
          </Badge>
        )}
      </div>

      <div
        data-testid={`inspector-timer-${job.id}`}
        className={cn(
          'tnum mt-2 text-center text-[40px] font-semibold leading-none tracking-tight',
          isActive ? 'text-[#14B8A6]' : 'text-zinc-500'
        )}
      >
        {formatElapsed(job.elapsedSeconds)}
      </div>
      <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
        Clock-on #{job.clockOnCount} · every fresh clock-on restarts at 00:00:00 · one live timer per
        technician
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                size="sm"
                data-testid="clock-on-btn"
                disabled={!canClockOn}
                className="dispatch-control w-full gap-1.5"
                onClick={handleClockOn}
              >
                <Play className="h-3.5 w-3.5" />
                Clock On
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {!job.techId
              ? 'Assign the job to a technician first'
              : isActive
                ? 'Timer already running on this row'
                : 'Start the single active timer for this technician'}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                size="sm"
                variant="secondary"
                data-testid="clock-off-btn"
                disabled={!canClockOff}
                className="dispatch-control w-full gap-1.5"
                onClick={handleClockOff}
              >
                <Square className="h-3.5 w-3.5" />
                Clock Off
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {isActive ? 'Freeze and finalize elapsed time' : 'No timer running on this job'}
          </TooltipContent>
        </Tooltip>
      </div>
    </section>
  )
}
