"use client"

import { ClipboardList, Link2, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { blockLabel } from "@/lib/format"
import { useBoardStore, useJobsList } from "@/stores/boardStore"
import { performAssignment } from "@/features/board/actions"
import { TimerControl } from "./TimerControl"
import { DocumentVault } from "./DocumentVault"
import { QuotePanel } from "./QuotePanel"

const PRIORITY_BADGE: Record<string, string> = { emergency: "border-urgent bg-urgent-wash text-urgent", high: "border-chrome-400 bg-chrome-wash text-chrome-400", normal: "border-line bg-fill text-ink-mid" }

function LinkedFragments({ job }: { job: { linkedGroupId?: string; id: string } }) {
  const jobs = useJobsList()
  const openDetails = useBoardStore(s => s.openDetails)
  if (!job.linkedGroupId) return null
  const fragments = jobs.filter(j => j.linkedGroupId === job.linkedGroupId).sort((a, b) => (a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? ""))
  return (
    <section className="panel p-3" data-testid="linked-fragments">
      <h3 className="label-mono flex items-center gap-1.5 text-2xs text-ink-low"><Link2 className="h-3 w-3 text-chrome-400" />LINKED VISITS · {fragments.length}</h3>
      <div className="mt-2 space-y-1">{fragments.map(fragment => <button key={fragment.id} data-testid={`fragment-${fragment.id}`} onClick={() => openDetails(fragment.id)} className={cn("label-mono tnum flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-2xs transition-colors", fragment.id === job.id ? "border-chrome-600 bg-chrome-wash text-chrome-600" : "border-line bg-recess text-ink-mid hover:border-chrome-400/50")}><span className="truncate">{fragment.title}</span><span>{fragment.scheduledDate ?? "TODAY"}</span></button>)}</div>
    </section>
  )
}

export function JobDetailsDialog() {
  const technicians = useBoardStore(s => s.technicians)
  const selectedJobId = useBoardStore(s => s.selectedJobId)
  const detailsOpen = useBoardStore(s => s.detailsOpen)
  const closeDetails = useBoardStore(s => s.closeDetails)
  const job = useBoardStore(s => selectedJobId ? s.jobs[selectedJobId] : undefined)

  if (!detailsOpen || !job) return null

  return (
    <aside className="fixed inset-y-12 right-3 z-40 flex w-[min(430px,calc(100vw-24px))] flex-col overflow-hidden rounded-xl border border-white/15 bg-slate-950/90 text-white shadow-2xl backdrop-blur-2xl" aria-label="Job details" data-testid={`inspector-${job.id}`}>
      <div className="shrink-0 border-b border-white/10 px-4 py-3">
        <button type="button" aria-label="Close details" data-testid="details-close" onClick={closeDetails} className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"><X className="h-4 w-4" /></button>
        <div className="flex items-start justify-between gap-3 pr-9"><div className="min-w-0"><h2 className="truncate text-base font-bold">{job.title}</h2><p className="label-mono tnum mt-1 text-2xs text-slate-400">{job.id.toUpperCase()} · {job.status} · {job.priority.toUpperCase()}</p></div><Badge className={cn("label-mono shrink-0 rounded-sm border text-2xs", PRIORITY_BADGE[job.priority])}>{job.priority}</Badge></div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs"><span className="font-semibold text-slate-100">{job.client}</span><span className="text-slate-400">{job.address}</span></div>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <section className="rounded-lg border border-white/10 bg-white/5 p-3 sm:col-span-2"><div className="flex items-center justify-between"><label className="label-mono text-2xs text-slate-400">ASSIGNMENT</label>{job.techId && <span className="label-mono tnum text-2xs text-slate-400">{blockLabel(job.startBlock)} → {blockLabel(job.startBlock + job.spanBlocks)}</span>}</div><select data-testid="tech-select" value={job.techId ?? ""} onChange={e => void performAssignment(job.id, e.target.value, job.startBlock)} className="mt-2 w-full rounded-md border border-white/10 bg-slate-900 px-2 py-2 text-xs text-white outline-none focus:border-blue-400"><option value="" disabled>Unassigned</option>{technicians.map(t => <option key={t.id} value={t.id}>{t.name} — {t.van}{job.requiredSkill && !t.skills.includes(job.requiredSkill) ? ` (no ${job.requiredSkill})` : ""}</option>)}</select>{job.requiredSkill && <p className="label-mono mt-1.5 text-2xs text-slate-400">REQUIRES <span className="text-blue-300">{job.requiredSkill}</span></p>}</section>
          <div className="sm:col-span-2"><TimerControl job={job} /></div>
          {job.linkedGroupId && <div className="sm:col-span-2"><LinkedFragments job={job} /></div>}
          <DocumentVault documents={job.documents} />
          <QuotePanel job={job} />
        </div>
      </div>
    </aside>
  )
}
