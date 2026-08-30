"use client"

import { ArrowRight, Siren } from "lucide-react"
import { useQueryState, parseAsString } from "nuqs"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatElapsed, todayIsoDay } from "@/lib/format"
import { useBoardStore, useJobsList } from "@/stores/boardStore"
import type { ComplianceDoc, Job } from "@/types"

interface DocAlert {
  job: Job
  doc: ComplianceDoc
  days: number
}

function StatCard({
  label,
  value,
  tone,
  testid
}: {
  label: string
  value: string | number
  tone: "chrome" | "pending" | "active" | "urgent"
  testid: string
}) {
  const toneClass = {
    chrome: "text-chrome-400",
    pending: "text-pending",
    active: "text-active",
    urgent: "text-urgent"
  }[tone]
  const stripeClass = {
    chrome: "bg-chrome-400",
    pending: "bg-pending",
    active: "bg-active",
    urgent: "bg-urgent"
  }[tone]
  return (
    <div data-testid={testid} className="panel relative overflow-hidden p-4">
      <span className={`absolute inset-y-0 left-0 w-[3px] ${stripeClass}`} />
      <div className="label-mono text-2xs text-ink-low">{label}</div>
      <div className={`tnum mt-1.5 font-mono text-[34px] font-bold leading-none ${toneClass}`}>
        {value}
      </div>
    </div>
  )
}

export function DashboardModule() {
  const jobs = useJobsList()
  const technicians = useBoardStore(s => s.technicians)
  const selectJob = useBoardStore(s => s.selectJob)
  const [, setModule] = useQueryState("module", parseAsString.withDefault("dashboard"))

  const today = todayIsoDay()
  const todayJobs = jobs.filter(j => !j.scheduledDate || j.scheduledDate === today)
  const queue = todayJobs.filter(j => j.status === "unassigned")
  const running = todayJobs.filter(j => j.timerRunning)

  const alerts: DocAlert[] = []
  for (const job of jobs) {
    for (const doc of job.documents) {
      if (!doc.expiresAt) continue
      const target = new Date(doc.expiresAt)
      const startOfTarget = new Date(
        target.getFullYear(),
        target.getMonth(),
        target.getDate()
      ).getTime()
      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)
      const days = Math.round((startOfTarget - startOfToday.getTime()) / 86_400_000)
      if (days <= 30) alerts.push({ job, doc, days })
    }
  }
  alerts.sort((a, b) => a.days - b.days)

  const openDispatch = (): void => {
    void setModule("dispatch")
  }

  return (
    <div className="scrollbar-thin h-full overflow-auto p-4" data-testid="dashboard-view">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="TODAY'S JOBS" value={todayJobs.length} tone="chrome" testid="stat-today" />
        <StatCard label="UNASSIGNED" value={queue.length} tone="pending" testid="stat-queue" />
        <StatCard label="ACTIVE TIMERS" value={running.length} tone="active" testid="stat-active" />
        <StatCard
          label="COMPLIANCE ALERTS"
          value={alerts.length}
          tone="urgent"
          testid="stat-alerts"
        />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
        {/* Queue preview */}
        <section className="panel flex max-h-[380px] min-h-[180px] flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
            <h2 className="label-mono text-2xs text-ink-low">UNASSIGNED QUEUE</h2>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-2xs text-chrome-400"
              onClick={openDispatch}
            >
              Dispatch board <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-1.5 p-3">
              {queue.map(job => (
                <button
                  key={job.id}
                  onClick={() => {
                    selectJob(job.id)
                    openDispatch()
                  }}
                  className="flex w-full items-center gap-2 rounded-md border border-line bg-recess px-2.5 py-1.5 text-left transition-colors hover:border-chrome-400/50"
                >
                  {job.priority === "emergency" && (
                    <Siren className="h-3.5 w-3.5 shrink-0 animate-pulse-soft text-urgent" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold">{job.title}</span>
                  <span className="label-mono shrink-0 text-2xs text-ink-low">
                    {job.id.toUpperCase()}
                  </span>
                </button>
              ))}
              {queue.length === 0 && (
                <p className="py-8 text-center text-xs text-ink-low">Queue clear.</p>
              )}
            </div>
          </ScrollArea>
        </section>

        {/* Live timers */}
        <section className="panel flex max-h-[380px] min-h-[180px] flex-col overflow-hidden">
          <div className="border-b border-line px-3.5 py-2.5">
            <h2 className="label-mono text-2xs text-ink-low">ACTIVE TIMERS</h2>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-1.5 p-3">
              {running.map(job => {
                const tech = technicians.find(t => t.id === job.techId)
                return (
                  <div
                    key={job.id}
                    className="flex items-center gap-2.5 rounded-md border border-active/40 bg-active-wash px-2.5 py-2"
                  >
                    <span className="h-2 w-2 shrink-0 animate-pulse-soft rounded-full bg-active" />
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="truncate text-xs font-semibold">{job.title}</div>
                      <div className="label-mono text-2xs text-ink-low">
                        {tech ? `${tech.name.split(" ")[0]} · ${tech.van}` : "UNASSIGNED"}
                      </div>
                    </div>
                    <span className="tnum shrink-0 font-mono text-sm font-bold text-active">
                      {formatElapsed(job.elapsedSeconds)}
                    </span>
                  </div>
                )
              })}
              {running.length === 0 && (
                <div className="flex items-center justify-between gap-3 px-1 py-4">
                  <p className="text-xs text-ink-low">No live timers.</p>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-2xs text-chrome-400" onClick={openDispatch}>Open dispatch <ArrowRight className="ml-1 h-3 w-3" /></Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </section>

        {/* Compliance alerts */}
        <section className="panel flex max-h-[380px] min-h-[180px] flex-col overflow-hidden">
          <div className="border-b border-line px-3.5 py-2.5">
            <h2 className="label-mono text-2xs text-ink-low">COMPLIANCE VAULT · 30-DAY WINDOW</h2>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-1.5 p-3">
              {alerts.map(({ job, doc, days }) => (
                <button
                  key={doc.id}
                  onClick={() => {
                    selectJob(job.id)
                    openDispatch()
                  }}
                  className="flex w-full items-center gap-2.5 rounded-md border border-line bg-recess px-2.5 py-1.5 text-left transition-colors hover:border-chrome-400/50"
                >
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="truncate text-xs font-semibold">{doc.name}</div>
                    <div className="label-mono truncate text-2xs text-ink-low">
                      {doc.ref} · {job.title}
                    </div>
                  </div>
                  <Badge
                    className={
                      days < 0
                        ? "label-mono h-5 shrink-0 rounded-full bg-urgent-wash px-1.5 text-2xs text-urgent hover:bg-urgent-wash"
                        : "label-mono h-5 shrink-0 animate-pulse-soft rounded-full bg-pending-wash px-1.5 text-2xs text-pending hover:bg-pending-wash"
                    }
                  >
                    {days < 0 ? "EXPIRED" : `${days}D`}
                  </Badge>
                </button>
              ))}
              {alerts.length === 0 && (
                <p className="py-8 text-center text-xs text-ink-low">
                  All compliance documents current.
                </p>
              )}
            </div>
          </ScrollArea>
        </section>
      </div>
    </div>
  )
}
