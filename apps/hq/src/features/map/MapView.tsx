"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { useQueryState, parseAsString } from "nuqs"
import { AlertTriangle } from "lucide-react"

import { todayIsoDay } from "@/lib/format"
import { travelMinutes } from "@/lib/travel"
import { useBoardStore, useJobsList } from "@/stores/boardStore"

import type { BoardFilters } from "@/features/board/filters"
import { jobMatchesFilters } from "@/features/board/filters"
import { MapErrorBoundary } from "./MapErrorBoundary"

const MapLibreView = dynamic(() => import("./MapLibreView"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-xs text-ink-low">Loading live map…</div>
})

export function MapView({ filters }: { filters: BoardFilters }) {
  const technicians = useBoardStore(s => s.technicians)
  const openDetails = useBoardStore(s => s.openDetails)
  const jobs = useJobsList()
  const [date] = useQueryState("date", parseAsString.withDefault(todayIsoDay()))
  const [vanId, setVanId] = useState("")
  const visible = jobs.filter(j => (!j.scheduledDate || j.scheduledDate === date) && jobMatchesFilters(j, filters))
  const selectedTech = technicians.find(t => t.id === vanId)
  const unassignedCount = visible.filter(job => job.status === "unassigned").length
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
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <h2 className="label-mono text-xs text-ink-mid">SERVICE AREA · LIVE</h2>
        <select data-testid="map-van-select" value={vanId} onChange={e => setVanId(e.target.value)} className="label-mono h-7 rounded-md border border-line bg-recess px-2 text-2xs text-ink outline-none focus:border-chrome-600">
          <option value="">ALL CREWS</option>
          {technicians.map(tech => <option key={tech.id} value={tech.id}>{tech.van.toUpperCase()} · {tech.name.split(" ")[0].toUpperCase()}</option>)}
        </select>
        {selectedTech && <span data-testid="map-eta" className="label-mono tnum rounded-md border border-chrome-600/50 bg-chrome-wash px-2 py-1 text-2xs text-chrome-600">{selectedTech.van.toUpperCase()} · {stops.length} STOPS · EST. TRAVEL {etaMinutes} MIN</span>}
        {unassignedCount > 0 && <span data-testid="map-unassigned" className="label-mono tnum rounded-md border border-chrome-600/50 bg-chrome-wash px-2 py-1 text-2xs text-chrome-600">{unassignedCount} UNASSIGNED · DRAG IN CREW VIEW</span>}
        {tightRoutes > 0 && <span data-testid="map-route-risk" className="label-mono tnum flex items-center gap-1.5 rounded-md border border-pending/50 bg-pending-wash px-2 py-1 text-2xs text-pending"><AlertTriangle className="h-3 w-3" />{tightRoutes} ROUTE GAP{tightRoutes === 1 ? "" : "S"} AT RISK</span>}
      </div>
      <div className="relative min-h-0 flex-1">
        <MapErrorBoundary>
          <MapLibreView visible={visible} vanId={vanId} onSelectJob={openDetails} />
        </MapErrorBoundary>
      </div>
    </div>
  )
}
