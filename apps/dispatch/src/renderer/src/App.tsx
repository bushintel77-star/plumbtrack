import { useEffect, useState } from 'react'
import type { Job } from '@/types'
import { ClipboardList, LayoutGrid, Map, MessageSquare, PanelLeft, Search, Users } from 'lucide-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/toaster'
import { TopBar } from '@/components/layout/TopBar'
import { LeftPanel } from '@/components/left/LeftPanel'
import { DispatchCanvas } from '@/components/center/DispatchCanvas'
import { InspectorDrawer } from '@/components/right/InspectorDrawer'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { FullJobDetailsDialog } from '@/components/right/FullJobDetailsDialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useDispatchStore } from '@/store/dispatchStore'

export default function App(): JSX.Element {
  const setPaletteOpen = useDispatchStore((s) => s.setPaletteOpen)
  const selectedJobId = useDispatchStore((s) => s.selectedJobId)
  const jobs = useDispatchStore((s) => s.jobs)
  const [queueOpen, setQueueOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [detailsJobId, setDetailsJobId] = useState<string | null>(null)
  const detailsJob: Job | undefined = jobs.find((job) => job.id === detailsJobId)

  useEffect(() => {
    const interval = setInterval(() => useDispatchStore.getState().tick(), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPaletteOpen])

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-chassis">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <nav aria-label="Primary navigation" className="glass flex w-14 shrink-0 flex-col items-center gap-2 border-y-0 border-l-0 py-3">
            <button type="button" onClick={() => setQueueOpen(true)} className="dispatch-control rounded-lg p-2.5 text-muted-foreground hover:bg-white/10 hover:text-foreground" aria-label="Open work queue" title="Work queue"><PanelLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => setInspectorOpen(true)} className="dispatch-control rounded-lg p-2.5 text-muted-foreground hover:bg-white/10 hover:text-foreground" aria-label="Open job inspector" title="Job inspector"><ClipboardList className="h-4 w-4" /></button>
            <button type="button" onClick={() => setPaletteOpen(true)} className="dispatch-control rounded-lg p-2.5 text-muted-foreground hover:bg-white/10 hover:text-foreground" aria-label="Search jobs" title="Search jobs"><Search className="h-4 w-4" /></button>
            <div className="my-1 h-px w-6 bg-white/10" />
            <span className="rounded-lg bg-primary/15 p-2.5 text-blue-300" title="Planner"><LayoutGrid className="h-4 w-4" /></span>
            <span className="p-2.5 text-muted-foreground/50" title="Technicians"><Users className="h-4 w-4" /></span>
            <span className="p-2.5 text-muted-foreground/50" title="GPS map"><Map className="h-4 w-4" /></span>
            <span className="p-2.5 text-muted-foreground/50" title="Messages"><MessageSquare className="h-4 w-4" /></span>
          </nav>
          <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden p-2">
            <DispatchCanvas onOpenDetails={(job) => { setDetailsJobId(job.id); setInspectorOpen(true) }} />
          </main>
        </div>
        <Sheet open={queueOpen} onOpenChange={setQueueOpen}>
          <SheetContent side="left" className="glass w-[min(380px,90vw)] border-white/10 p-3">
            <SheetHeader className="px-2 pb-3 pr-8"><SheetTitle>Work queue</SheetTitle><SheetDescription>Unassigned work and HQ communications.</SheetDescription></SheetHeader>
            <LeftPanel onOpenDetails={(jobId) => { setDetailsJobId(jobId); setQueueOpen(false); setInspectorOpen(true) }} />
          </SheetContent>
        </Sheet>
        <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
          <SheetContent side="right" className="glass w-[min(420px,92vw)] border-white/10 p-0">
            <SheetHeader className="sr-only"><SheetTitle>Job inspector</SheetTitle><SheetDescription>Selected job telemetry and controls.</SheetDescription></SheetHeader>
            <InspectorDrawer onOpenDetails={() => setDetailsJobId(selectedJobId)} />
          </SheetContent>
        </Sheet>
        <CommandPalette />
        <FullJobDetailsDialog job={detailsJob} open={Boolean(detailsJob)} onOpenChange={(open) => { if (!open) setDetailsJobId(null) }} />
        <Toaster />
      </div>
    </TooltipProvider>
  )
}
