"use client"

import { useEffect, useState } from "react"
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs"
import {
  BarChart3,
  CalendarRange,
  Check,
  FileText,
  Link2,
  Map,
  Search,
  Users,
  Wifi
} from "lucide-react"

import { useBoardLifecycle } from "@/features/board/useBoardLifecycle"
import { authApi } from "@/lib/api"
import { dayLabel, todayIsoDay } from "@/lib/format"
import { cn } from "@/lib/utils"
import { jobDay } from "@/lib/schedule"
import { useBoardStore, useJobsList } from "@/stores/boardStore"
import { MessageSquare } from "lucide-react"

import { CrmSurface } from "./CrmSurface"
import { DispatchSurface, type Zoom } from "./DispatchSurface"
import { DocumentsSurface } from "./DocumentsSurface"
import { MapSurface } from "./MapSurface"
import { Palette } from "./Palette"
import { ReportsSurface } from "./ReportsSurface"
import { useFailedOps } from "./failedOps"

const SURFACES = ["dispatch", "map", "documents", "crm", "reports"] as const
export type Surface = (typeof SURFACES)[number]

const SURFACE_META: Record<Surface, { label: string; icon: typeof Map }> = {
  dispatch: { label: "Dispatch", icon: CalendarRange },
  map: { label: "Map", icon: Map },
  documents: { label: "Documents", icon: FileText },
  crm: { label: "Customers", icon: Users },
  reports: { label: "Reports", icon: BarChart3 }
}

const ZOOMS = ["daily", "weekly", "monthly"] as const

const CONNECTION_COPY = {
  live: "Live",
  connecting: "Connecting",
  demo: "Demo data"
} as const

export function FieldLoopWorkspace({ moduleSurface = "dispatch" }: { moduleSurface?: Surface }) {
  // Live board data, demo fallback and the timer heartbeat come from the same
  // lifecycle the legacy Board uses, so FieldLoop is never stuck on seed data.
  useBoardLifecycle()
  // The legacy `module` param picks the entry surface; `surface` overrides it
  // once the dispatcher moves the rail, keeping both history and copied links
  // pointing at what is on screen.
  const [surfaceParam, setSurface] = useQueryState("surface", parseAsStringLiteral(SURFACES))
  const surface: Surface = surfaceParam ?? moduleSurface
  const [day, setDay] = useQueryState("date", parseAsString.withDefault(todayIsoDay()))
  const [zoom, setZoom] = useQueryState("zoom", parseAsStringLiteral(ZOOMS).withDefault("daily"))
  const dataMode = useBoardStore(s => s.dataMode)
  const jobs = useJobsList()
  const [paletteOpen, setPaletteOpen] = useState(false)
  // Selection lives in the URL so a dispatcher can paste a link to exactly
  // the job or crew member they are talking about.
  const [selectedJobId, setSelectedJobId] = useQueryState("job", parseAsString.withDefault(""))
  const [selectedTechId, setSelectedTechId] = useQueryState("tech", parseAsString.withDefault(""))
  const [copied, setCopied] = useState(false)
  const failedOps = useFailedOps(s => s.ops)
  const syncPaneOpen = useFailedOps(s => s.syncPaneOpen)
  const setSyncPaneOpen = useFailedOps(s => s.setSyncPaneOpen)
  // Slack comms bridge — the panel renders app-wide; this is its only opener.
  const setCommsOpen = useBoardStore(s => s.setCommsOpen)
  const slackFeed = useBoardStore(s => s.slackFeed)
  const newJobCards = slackFeed.filter(card => card.kind === "new-job").length

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setPaletteOpen(open => !open)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <div className="fl-window" data-testid="fieldloop-workspace">
      <header className="fl-topbar">
        <span className="fl-brand">FIELDLOOP</span>
        <span className="fl-divider" />
        <span className="fl-section">{SURFACE_META[surface].label}</span>
        <button type="button" className="fl-search" onClick={() => setPaletteOpen(true)}>
          <Search size={13} />
          <span>Search jobs and crew…</span>
          <kbd>⌘K</kbd>
        </button>
        <div className="fl-top-right">
          <span className="fl-date">{dayLabel(day)}</span>
          <button
            type="button"
            className="fl-linkbtn"
            onClick={() => {
              void navigator.clipboard.writeText(window.location.href).then(() => {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1500)
              })
            }}
          >
            {copied ? <Check size={12} /> : <Link2 size={12} />}
            {copied ? "Copied" : "Copy link"}
          </button>
          {failedOps.length > 0 && (
            <button
              type="button"
              className={cn("fl-ops", syncPaneOpen && "active")}
              data-testid="fl-failed-ops"
              onClick={() => setSyncPaneOpen(!syncPaneOpen)}
            >
              <Wifi size={12} />
              {failedOps.length} failed
            </button>
          )}
          <button
            type="button"
            className="fl-linkbtn"
            data-testid="comms-trigger"
            aria-label={`Open comms — ${slackFeed.length} Slack cards`}
            onClick={() => setCommsOpen(true)}
          >
            <MessageSquare size={12} />
            COMMS
            {newJobCards > 0 && (
              <span className="tnum rounded-full bg-urgent px-1.5 text-[10px] font-bold text-on-accent">
                {newJobCards}
              </span>
            )}
          </button>
          {/* Connection state is deliberately outside the job status palette:
              red/amber/green mean work, never network. */}
          <span
            className={cn("fl-conn", dataMode === "live" && "live", dataMode === "demo" && "demo")}
            data-testid="fl-connection"
          >
            <i />
            {CONNECTION_COPY[dataMode]}
          </span>
          <button
            type="button"
            className="fl-linkbtn"
            data-testid="fl-sign-out"
            aria-label="Sign out"
            onClick={() => {
              void authApi.signOut().catch(() => undefined).finally(() => {
                // A signed-out console must not keep serving the cached board;
                // the reload re-runs the session gate.
                window.location.reload()
              })
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="fl-shell">
        <nav className="fl-rail" aria-label="Surfaces">
          {SURFACES.map(item => {
            const Icon = SURFACE_META[item].icon
            return (
              <button
                type="button"
                key={item}
                aria-label={SURFACE_META[item].label}
                aria-current={surface === item ? "page" : undefined}
                className={cn(surface === item && "active")}
                onClick={() => void setSurface(item)}
              >
                <Icon size={17} />
              </button>
            )
          })}
        </nav>

        {surface === "dispatch" && (
          <DispatchSurface
            day={day}
            onDayChange={next => void setDay(next)}
            zoom={zoom as Zoom}
            onZoomChange={next => void setZoom(next)}
            selectedJobId={selectedJobId}
            onSelectJob={next => void setSelectedJobId(next || null)}
            selectedTechId={selectedTechId}
            onSelectTech={next => void setSelectedTechId(next || null)}
          />
        )}
        {surface === "map" && (
          <MapSurface
            day={day}
            selectedJobId={selectedJobId}
            onSelectJob={next => void setSelectedJobId(next || null)}
          />
        )}
        {surface === "documents" && <DocumentsSurface />}
        {surface === "crm" && <CrmSurface />}
        {surface === "reports" && <ReportsSurface />}
      </div>

      <Palette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onPickJob={jobId => {
          void setSelectedJobId(jobId)
          // Follow the hit to the day it lives on, or the board would open on
          // a date where the chosen job is not visible.
          const job = jobs.find(item => item.id === jobId)
          if (job) void setDay(jobDay(job))
          void setSurface("dispatch")
        }}
        onPickTechnician={techId => {
          void setSelectedTechId(techId)
          void setSurface("dispatch")
        }}
      />
    </div>
  )
}
