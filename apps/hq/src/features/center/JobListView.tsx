"use client"

import { Siren } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { statusStyleFor } from "@/lib/statusStyles"
import { blockLabel, formatElapsed } from "@/lib/format"
import { useBoardStore, useJobsList } from "@/stores/boardStore"

import type { BoardFilters } from "@/features/board/filters"
import { jobMatchesFilters } from "@/features/board/filters"

export function JobListView({ filters }: { filters: BoardFilters }) {
  const jobs = useJobsList()
  const openDetails = useBoardStore(s => s.openDetails)
  const selectedJobId = useBoardStore(s => s.selectedJobId)
  const technicians = useBoardStore(s => s.technicians)
  const visible = jobs.filter(job => jobMatchesFilters(job, filters))

  return (
    <ScrollArea className="h-full">
      <div className="p-4" data-testid="list-view">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left">
          <thead>
            <tr className="label-mono text-2xs text-ink-low">
              <th className="border-b border-line pb-2 pl-2 font-semibold">JOB</th>
              <th className="border-b border-line pb-2 font-semibold">CLIENT</th>
              <th className="border-b border-line pb-2 font-semibold">TECHNICIAN</th>
              <th className="border-b border-line pb-2 font-semibold">SLOT</th>
              <th className="border-b border-line pb-2 font-semibold">TIMER</th>
              <th className="border-b border-line pb-2 pr-2 font-semibold">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(job => {
              const tech = technicians.find(t => t.id === job.techId)
              return (
                <tr
                  key={job.id}
                  data-testid={`list-row-${job.id}`}
                  onClick={() => openDetails(job.id)}
                  className={cn(
                    "cursor-pointer text-[13px] transition-colors hover:bg-fill",
                    selectedJobId === job.id && "bg-chrome-wash"
                  )}
                >
                  <td className="border-b border-line/50 py-2.5 pl-2">
                    <span className="flex items-center gap-1.5">
                      {job.priority === "emergency" && (
                        <Siren className="h-3.5 w-3.5 shrink-0 animate-pulse-soft text-urgent" />
                      )}
                      <span className="font-semibold">{job.title}</span>
                      <span className="label-mono tnum text-2xs text-ink-low">
                        {job.id.toUpperCase()}
                      </span>
                    </span>
                  </td>
                  <td className="border-b border-line/50 py-2.5 text-ink-mid">{job.client}</td>
                  <td className="border-b border-line/50 py-2.5 text-ink-mid">
                    {tech ? `${tech.name.split(" ")[0]} — ${tech.van}` : "—"}
                  </td>
                  <td className="label-mono tnum border-b border-line/50 py-2.5 text-2xs text-ink-mid">
                    {job.techId
                      ? `${blockLabel(job.startBlock)} → ${blockLabel(job.startBlock + job.spanBlocks)}`
                      : "—"}
                  </td>
                  <td className="border-b border-line/50 py-2.5">
                    {job.status === "active" ? (
                      <span
                        data-testid={`timer-${job.id}`}
                        className="tnum font-mono font-bold text-active"
                      >
                        {formatElapsed(job.elapsedSeconds)}
                      </span>
                    ) : job.status === "complete" ? (
                      <span className="tnum font-mono text-ink-low">
                        {formatElapsed(job.elapsedSeconds)}
                      </span>
                    ) : (
                      <span className="text-ink-low">—</span>
                    )}
                  </td>
                  <td className="border-b border-line/50 py-2.5 pr-2">
                    <Badge
                      className={cn(
                        "label-mono rounded-sm border text-2xs",
                        statusStyleFor(job).badge
                      )}
                    >
                      {statusStyleFor(job).label}
                    </Badge>
                  </td>
                </tr>
              )
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-xs text-ink-low">
                  No jobs match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </ScrollArea>
  )
}
