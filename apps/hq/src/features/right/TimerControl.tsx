"use client"

import { useState } from "react"
import { Play, Square } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { formatElapsed } from "@/lib/format"
import { useBoardStore } from "@/stores/boardStore"
import type { Job } from "@/types"
import { performClockOff, performClockOn } from "@/features/board/actions"

export function TimerControl({ job }: { job: Job }) {
  const technicians = useBoardStore(s => s.technicians)
  const [wrapOpen, setWrapOpen] = useState(false)
  const [mealBreak, setMealBreak] = useState(false)
  const [safety, setSafety] = useState(false)
  const tech = technicians.find(t => t.id === job.techId)
  const isActive = job.status === "active"
  const canClockOn = Boolean(job.techId) && !isActive
  const canClockOff = isActive

  return (
    <>
      <section className="rounded-lg border border-line bg-recess/70 p-2.5">
        <div className="flex items-center justify-between"><h3 className="label-mono text-2xs text-ink-low">ACTIVE TIMER</h3>{isActive ? <Badge className="label-mono animate-pulse-soft rounded-sm bg-active-wash text-2xs text-active hover:bg-active-wash">RUNNING</Badge> : <Badge variant="outline" className="label-mono rounded-sm border-line text-2xs text-ink-low">{job.status === "complete" ? "COMPLETE" : "IDLE"}</Badge>}</div>
        <div data-testid={`inspector-timer-${job.id}`} className={cn("tnum mt-1.5 text-center font-mono text-[26px] font-bold leading-none tracking-tight", isActive ? "text-active" : "text-ink-low")}>{formatElapsed(job.elapsedSeconds)}</div>
        <p className="label-mono mt-1.5 text-center text-2xs leading-relaxed text-ink-low">CLOCK-ON #{job.clockOnCount} · FRESH CLOCK-ON RESTARTS 00:00:00 · ONE LIVE TIMER PER TECH</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Tooltip><TooltipTrigger asChild><span className="inline-flex"><Button size="sm" data-testid="clock-on-btn" disabled={!canClockOn} className="btn-primary w-full gap-1.5" onClick={() => void performClockOn(job.id)}><Play className="h-3.5 w-3.5" />Clock On</Button></span></TooltipTrigger><TooltipContent side="bottom">{!job.techId ? "Assign the job to a technician first" : isActive ? "Timer already running on this row" : `Start the single active timer for ${tech?.name.split(" ")[0] ?? "this technician"}`}</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><span className="inline-flex"><Button size="sm" variant="secondary" data-testid="clock-off-btn" disabled={!canClockOff} className="w-full gap-1.5" onClick={() => setWrapOpen(true)}><Square className="h-3.5 w-3.5" />Clock Off</Button></span></TooltipTrigger><TooltipContent side="bottom">{isActive ? "Complete the shift wrap-up before clocking off" : "No timer running on this job"}</TooltipContent></Tooltip>
        </div>
      </section>
      <Dialog open={wrapOpen} onOpenChange={setWrapOpen}>
        <DialogContent className="panel-strong sm:max-w-md">
          <DialogHeader><DialogTitle>Shift wrap-up</DialogTitle><DialogDescription>Confirm the field handoff before closing this timer.</DialogDescription></DialogHeader>
          <div className="space-y-3 py-2">
            <label className="flex items-start gap-3 rounded-md border border-line bg-recess p-3 text-xs"><Checkbox checked={mealBreak} onCheckedChange={value => setMealBreak(value === true)} /><span><strong className="block">Meal break recorded</strong><span className="text-ink-mid">Required labor confirmation for this shift.</span></span></label>
            <label className="flex items-start gap-3 rounded-md border border-line bg-recess p-3 text-xs"><Checkbox checked={safety} onCheckedChange={value => setSafety(value === true)} /><span><strong className="block">Safety and site handoff complete</strong><span className="text-ink-mid">No open safety issue remains with this visit.</span></span></label>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setWrapOpen(false)}>Keep timer running</Button><Button data-testid="confirm-clock-off" disabled={!mealBreak || !safety} onClick={() => { setWrapOpen(false); void performClockOff(job.id) }}>Confirm clock off</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
