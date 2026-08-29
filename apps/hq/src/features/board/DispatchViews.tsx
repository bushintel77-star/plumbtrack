"use client"

import { useMemo } from "react"
import { CheckCircle2, Clock3, GripVertical, List, Table2 } from "lucide-react"
import { useBoardStore, useJobsList } from "@/stores/boardStore"
import { statusStyleFor } from "@/lib/statusStyles"
import { blockLabel, TOTAL_BLOCKS } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { BoardFilters, } from "./filters"
import { jobMatchesFilters } from "./filters"

export function DispatchTable({ filters }: { filters: BoardFilters }) {
  const jobs = useJobsList().filter(job => jobMatchesFilters(job, filters))
  const technicians = useBoardStore(s => s.technicians)
  const openDetails = useBoardStore(s => s.openDetails)
  return <div className="h-full overflow-auto p-3" data-testid="kibu-table-view">
    <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left">
      <thead className="sticky top-0 z-10 bg-void-95 backdrop-blur"><tr className="label-mono text-2xs text-ink-low">
        <th className="border-b border-line px-3 py-2">JOB</th><th className="border-b border-line px-3 py-2">OWNER</th><th className="border-b border-line px-3 py-2">WINDOW</th><th className="border-b border-line px-3 py-2">STATUS</th>
      </tr></thead>
      <tbody>{jobs.map(job => { const tech = technicians.find(t => t.id === job.techId); const style = statusStyleFor(job); return <tr key={job.id} className="group cursor-pointer hover:bg-fill" onClick={() => openDetails(job.id)}>
        <td className="border-b border-line/50 px-3 py-2"><div className="flex items-center gap-2"><GripVertical className="h-3.5 w-3.5 text-ink-low"/><span className="font-semibold">{job.title}</span><span className="label-mono text-2xs text-ink-low">{job.id.toUpperCase()}</span></div><div className="pl-5 text-2xs text-ink-mid">{job.client}</div></td>
        <td className="border-b border-line/50 px-3 py-2 text-sm text-ink-mid">{tech?.name ?? "Unassigned"}</td>
        <td className="label-mono tnum border-b border-line/50 px-3 py-2 text-2xs text-ink-mid">{job.techId ? `${blockLabel(job.startBlock)}–${blockLabel(job.startBlock + job.spanBlocks)}` : "—"}</td>
        <td className="border-b border-line/50 px-3 py-2"><span className={cn("label-mono inline-flex items-center gap-1 rounded-sm px-1.5 py-1 text-2xs", style.badge)}><CheckCircle2 className="h-3 w-3"/>{style.label}</span></td>
      </tr> })}</tbody>
    </table>
  </div>
}

export function DispatchList({ filters }: { filters: BoardFilters }) {
  const jobs = useJobsList().filter(job => jobMatchesFilters(job, filters))
  const openDetails = useBoardStore(s => s.openDetails)
  return <div className="h-full overflow-auto p-3" data-testid="kibu-list-view"><div className="mx-auto max-w-3xl space-y-1.5">{jobs.map(job => { const style = statusStyleFor(job); return <button key={job.id} onClick={() => openDetails(job.id)} className="panel flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-fill"><span className={cn("h-2 w-2 shrink-0 rounded-full", style.chip.split(" ")[0])} aria-hidden/><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{job.title}</span><span className="block truncate text-xs text-ink-mid">{job.client} · {job.address}</span></span><span className="label-mono tnum flex items-center gap-1 text-2xs text-ink-low"><Clock3 className="h-3 w-3"/>{job.techId ? blockLabel(job.startBlock) : "QUEUE"}</span><span className={cn("label-mono rounded-sm px-1.5 py-1 text-2xs", style.badge)}>{style.label}</span></button>})}</div></div>
}

export function DispatchGantt({ filters }: { filters: BoardFilters }) {
  const jobs = useJobsList().filter(job => jobMatchesFilters(job, filters))
  const technicians = useBoardStore(s => s.technicians)
  const openDetails = useBoardStore(s => s.openDetails)
  const rows = useMemo(() => technicians.map(tech => ({ tech, jobs: jobs.filter(job => job.techId === tech.id) })), [jobs, technicians])
  return <div className="h-full overflow-auto p-3" data-testid="kibu-gantt-view"><div className="min-w-[1040px]"><div className="grid border-b border-line bg-void-95" style={{ gridTemplateColumns: `176px repeat(${TOTAL_BLOCKS}, minmax(42px, 1fr))` }}><div className="label-mono px-3 py-2 text-2xs text-ink-low">TECHNICIAN</div>{Array.from({length: TOTAL_BLOCKS}, (_, i) => <div key={i} className="label-mono tnum border-l border-line/40 py-2 text-center text-2xs text-ink-low">{i % 2 === 0 ? blockLabel(i) : ""}</div>)}</div>{rows.map(({tech, jobs: rowJobs}) => <div key={tech.id} className="grid min-h-16 border-b border-line/50" style={{gridTemplateColumns: `176px repeat(${TOTAL_BLOCKS}, minmax(42px, 1fr))`}}><div className="sticky left-0 z-10 flex items-center border-r border-line bg-void-95 px-3 text-sm font-semibold">{tech.name}</div><div className="relative col-span-full -ml-[0px]" style={{gridColumn: `2 / span ${TOTAL_BLOCKS}`, backgroundImage: "linear-gradient(to right, var(--divider-etch) 1px, transparent 1px)", backgroundSize: `calc(100% / ${TOTAL_BLOCKS}) 100%`}}>{rowJobs.map(job => { const style = statusStyleFor(job); return <button key={job.id} onClick={() => openDetails(job.id)} className={cn("absolute inset-y-2 rounded px-2 text-left text-2xs font-semibold text-on-accent hover:brightness-110", style.chip)} style={{left: `${job.startBlock / TOTAL_BLOCKS * 100}%`, width: `${job.spanBlocks / TOTAL_BLOCKS * 100}%`}}>{job.id.replace("j-", "Job #")}</button>})}</div></div>)}</div></div>
}
