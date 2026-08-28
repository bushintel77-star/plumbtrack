"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { useQueryState, parseAsString } from "nuqs"
import { useDraggable } from "@dnd-kit/core"
import { MapPin } from "lucide-react"

import { todayIsoDay } from "@/lib/format"
import { travelMinutes } from "@/lib/travel"
import { useBoardStore, useJobsList } from "@/stores/boardStore"

import type { Job } from "@/types"
import type { BoardFilters } from "@/features/board/filters"
import { jobMatchesFilters } from "@/features/board/filters"
import { MapContextPanel } from "./MapContextPanel"

const MapLibreView = dynamic(() => import("./MapLibreView"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-xs text-ink-low">Loading live map…</div>
})

function MapJobCard({ job }: { job: Job }) {
  const openDetails = useBoardStore(s => s.openDetails)
  const drag = useDraggable({ id: job.id, data: { jobId: job.id, spanBlocks: job.spanBlocks, source: "map" } })
  return (
    <button
      ref={drag.setNodeRef}
      {...drag.listeners}
      {...drag.attributes}
      type="button"
      onClick={() => openDetails(job.id)}
      className="flex w-full cursor-grab items-center gap-2 rounded-md border border-white/10 bg-white/10 px-2 py-2 text-left text-xs text-white hover:border-blue-400 active:cursor-grabbing"
    >
      <MapPin className="h-3.5 w-3.5 shrink-0 text-blue-300" />
      <span className="min-w-0 flex-1 truncate">{job.title}</span>
      <span className="label-mono text-2xs text-slate-400">{job.spanBlocks * 30}M</span>
    </button>
  )
}

function UnassignedMapJobs({ jobs }: { jobs: Job[] }) {
  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-20 w-56 rounded-xl border border-white/15 bg-slate-950/85 p-3 text-white shadow-xl backdrop-blur-xl">
      <div className="label-mono text-2xs text-blue-300">SMART ROUTING QUEUE</div>
      <p className="mt-1 text-xs text-slate-400">Drag a job toward Crew view, or open it for assignment.</p>
      <div className="mt-2 space-y-1.5">{jobs.map(job => <MapJobCard key={job.id} job={job} />)}</div>
    </div>
  )
}

export function MapView({ filters }: { filters: BoardFilters }) {
  const technicians = useBoardStore(s => s.technicians)
  const openDetails = useBoardStore(s => s.openDetails)
  const jobs = useJobsList()
  const [date] = useQueryState("date", parseAsString.withDefault(todayIsoDay()))
  const [vanId, setVanId] = useState("")
  const visible = jobs.filter(j => (!j.scheduledDate || j.scheduledDate === date) && jobMatchesFilters(j, filters))
  const selectedTech = technicians.find(t => t.id === vanId)
  const stops = selectedTech ? visible.filter(j => j.techId === selectedTech.id && j.location).sort((a, b) => a.startBlock - b.startBlock) : []
  let etaMinutes = 0
  for (let i = 1; i < stops.length; i++) etaMinutes += travelMinutes(stops[i - 1].location!, stops[i].location!)
  const tightRoutes = stops.reduce((count, stop, index) => {
    if (index === 0) return count
    const previous = stops[index - 1]
    const available = (stop.startBlock - previous.startBlock - previous.spanBlocks) * 30
    return count + (travelMinutes(previous.location!, stop.location!) > available ? 1 : 0)
  }, 0)

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="map-view">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line px-4 py-2.5">
        <h2 className="label-mono text-xs text-ink-mid">SERVICE AREA · LIVE</h2>
        <select data-testid="map-van-select" value={vanId} onChange={e => setVanId(e.target.value)} className="label-mono h-7 rounded-md border border-line bg-recess px-2 text-2xs text-ink outline-none focus:border-chrome-600">
          <option value="">ALL CREWS</option>
          {technicians.map(tech => <option key={tech.id} value={tech.id}>{tech.van.toUpperCase()} · {tech.name.split(" ")[0].toUpperCase()}</option>)}
        </select>
        {selectedTech && <span data-testid="map-eta" className="label-mono tnum rounded-md border border-chrome-600/50 bg-chrome-wash px-2 py-1 text-2xs text-chrome-600">{selectedTech.van.toUpperCase()} · {stops.length} STOPS · EST. TRAVEL {etaMinutes} MIN</span>}
      </div>
      <div className="relative min-h-0 flex-1">
        <MapLibreView visible={visible} vanId={vanId} onSelectJob={openDetails} />
        <MapContextPanel stopCount={stops.length} etaMinutes={etaMinutes} unassignedCount={visible.filter(job => job.status === "unassigned").length} tightRoutes={tightRoutes} />
        <UnassignedMapJobs jobs={visible.filter(job => job.status === "unassigned")} />
      </div>
    </div>
  )
}
