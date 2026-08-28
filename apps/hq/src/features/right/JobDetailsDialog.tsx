"use client"

import { Link2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { blockLabel } from "@/lib/format"
import { useBoardStore, useJobsList } from "@/stores/boardStore"
import { performAssignment } from "@/features/board/actions"
import { TimerControl } from "./TimerControl"

function LinkedFragments({ job }: { job: { linkedGroupId?: string; id: string } }) {
  const jobs = useJobsList()
  const openDetails = useBoardStore(s => s.openDetails)
  if (!job.linkedGroupId) return null
  const fragments = jobs.filter(j => j.linkedGroupId === job.linkedGroupId).sort((a, b) => (a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? ""))
  return (
    <section className="rounded-lg border border-line bg-recess/70 p-2.5" data-testid="linked-fragments">
      <h3 className="label-mono flex items-center gap-1.5 text-2xs text-ink-low"><Link2 className="h-3 w-3 text-chrome-400" />LINKED VISITS · {fragments.length}</h3>
      <div className="mt-2 space-y-1">{fragments.map(fragment => <button key={fragment.id} data-testid={`fragment-${fragment.id}`} onClick={() => openDetails(fragment.id)} className={cn("label-mono tnum flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-2xs", fragment.id === job.id ? "border-chrome-600 bg-chrome-wash text-chrome-600" : "border-line bg-recess text-ink-mid hover:border-chrome-400/50")}><span className="truncate">{fragment.title}</span><span>{fragment.scheduledDate ?? "TODAY"}</span></button>)}</div>
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
    <aside className="fixed inset-y-12 right-3 z-40 flex w-[min(340px,calc(100vw-24px))] flex-col overflow-hidden rounded-xl border border-line bg-void-95 text-ink shadow-2xl backdrop-blur-2xl" aria-label="Job details" data-testid={`inspector-${job.id}`}>
      <div className="shrink-0 border-b border-line px-3 py-2.5"><button type="button" aria-label="Close details" data-testid="details-close" onClick={closeDetails} className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-md text-ink-low transition-colors hover:bg-fill hover:text-chrome-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chrome-400"><X className="h-3.5 w-3.5" /></button><div className="pr-8"><h2 className="truncate text-sm font-bold">{job.title}</h2><p className="label-mono tnum mt-0.5 text-2xs text-ink-low">{job.id.toUpperCase()} · {job.status} · {job.priority.toUpperCase()}</p><div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-2xs"><span className="font-semibold text-ink">{job.client}</span><span className="text-ink-low">{job.address}</span></div></div></div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2.5"><div className="space-y-2"><section className="flex items-center gap-2 rounded-lg border border-line bg-recess/70 px-2 py-1.5"><label className="label-mono shrink-0 text-2xs text-ink-low">ASSIGN</label><select data-testid="tech-select" value={job.techId ?? ""} onChange={e => void performAssignment(job.id, e.target.value, job.startBlock)} className="min-w-0 flex-1 rounded-md border border-line bg-recess px-1.5 py-1 text-2xs text-ink outline-none focus:border-chrome-400"><option value="" disabled>Unassigned</option>{technicians.map(t => <option key={t.id} value={t.id}>{t.name} — {t.van}</option>)}</select><span className="label-mono tnum shrink-0 text-2xs text-ink-low">{blockLabel(job.startBlock)}→{blockLabel(job.startBlock + job.spanBlocks)}</span></section><TimerControl job={job} />{job.linkedGroupId && <LinkedFragments job={job} />}</div></div>
    </aside>
  )
}
