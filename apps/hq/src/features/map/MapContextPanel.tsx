"use client"

import { AlertTriangle, CircleDot, MapPin, Navigation, Route, Truck } from "lucide-react"

import { cn } from "@/lib/utils"

export function MapContextPanel({
  stopCount,
  etaMinutes,
  unassignedCount,
  tightRoutes
}: {
  stopCount: number
  etaMinutes: number
  unassignedCount: number
  tightRoutes: number
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="pointer-events-auto absolute left-4 top-4 w-64 rounded-xl border border-white/15 bg-slate-950/85 p-3 text-white shadow-xl backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div>
            <div className="label-mono text-2xs text-blue-300">SERVICE TERRITORY</div>
            <div className="mt-1 text-sm font-semibold">Melbourne · Caulfield South</div>
          </div>
          <Navigation className="h-4 w-4 text-blue-300" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-white/10 p-2"><div className="text-slate-400">Stops</div><strong className="tnum">{stopCount}</strong></div>
          <div className="rounded-md bg-white/10 p-2"><div className="text-slate-400">Travel</div><strong className="tnum">{etaMinutes} min</strong></div>
        </div>
        <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3 text-xs text-slate-300">
          <div className="flex items-center gap-2"><Truck className="h-3.5 w-3.5 text-blue-300" /> Live technician</div>
          <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-blue-300" /> Scheduled job</div>
          <div className="flex items-center gap-2"><CircleDot className="h-3.5 w-3.5 text-red-400" /> Emergency / attention</div>
          <div className="flex items-center gap-2"><Route className="h-3.5 w-3.5 text-amber-300" /> Route segment</div>
        </div>
      </div>

      <div className="pointer-events-auto absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/15 bg-slate-950/85 px-3 py-2 text-xs text-slate-200 shadow-xl backdrop-blur-xl">
        <span className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-blue-300" /> Drag an unassigned job pin onto a technician lane in Crew view to schedule it.</span>
        <span className={cn("flex items-center gap-1.5", tightRoutes > 0 ? "text-amber-300" : "text-slate-400")}>
          {tightRoutes > 0 ? <AlertTriangle className="h-3.5 w-3.5" /> : <Route className="h-3.5 w-3.5" />}
          {tightRoutes > 0 ? `${tightRoutes} route gap${tightRoutes === 1 ? "" : "s"} at risk` : "Routes within travel buffer"}
        </span>
        {unassignedCount > 0 && <span className="rounded-full bg-blue-500/20 px-2 py-1 text-blue-200">{unassignedCount} unassigned</span>}
      </div>
    </div>
  )
}
