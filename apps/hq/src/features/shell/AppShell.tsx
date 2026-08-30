"use client"

import { useEffect, useState } from "react"
import { authApi } from "@/lib/api"
import { useQueryState, parseAsString } from "nuqs"
import {
  BarChart3,
  Briefcase,
  Building2,
  CalendarDays,
  FileText,
  LayoutDashboard,
  Map as MapIcon,
  MessageSquare,
  Moon,
  Radio,
  Search,
  Sun,
  Table2,
  Users,
  Network
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useBoardStore } from "@/stores/boardStore"
import type { AppModule } from "@/types"

import { Board } from "@/features/board/Board"
import { CommandPalette } from "@/features/board/CommandPalette"
import { SlackCommsPanel } from "@/features/comms/SlackCommsPanel"
import { Toaster } from "@/components/ui/toaster"
import { OperationsHub } from "@/features/office/OperationsHub"
import { FieldLoopWorkspace } from "@/features/fieldloop/FieldLoopWorkspace"

const NAV: Array<{
  id: AppModule
  label: string
  icon: typeof LayoutDashboard
  enabled: boolean
  milestone: string
}> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, enabled: true, milestone: "" },
  { id: "dispatch", label: "Dispatch", icon: Table2, enabled: true, milestone: "" },
  { id: "operations", label: "Operations", icon: Radio, enabled: true, milestone: "" },
  { id: "kanban", label: "Kanban", icon: Network, enabled: true, milestone: "" },
  { id: "crews", label: "Crews", icon: Users, enabled: true, milestone: "" },
  { id: "jobs", label: "Jobs", icon: Briefcase, enabled: true, milestone: "" },
  { id: "customers", label: "Customers", icon: Building2, enabled: true, milestone: "" },
  { id: "forms", label: "Forms", icon: FileText, enabled: true, milestone: "" },
  { id: "reports", label: "Reports", icon: BarChart3, enabled: true, milestone: "" },
  { id: "accounting", label: "Accounting", icon: FileText, enabled: true, milestone: "" }
]

const ENABLED = new Set(NAV.filter(item => item.enabled).map(item => item.id))

/* Modules the FieldLoop workspace now owns; it routes between its own surfaces
   through the `surface` query param rather than the legacy `module` one. */
const FIELDLOOP_MODULES = new Set<AppModule>([
  "dashboard",
  "dispatch",
  "map",
  "forms",
  "customers",
  "reports",
  "accounting"
])

function useWallClock(): string {
  const [clock, setClock] = useState("--:--:--")
  useEffect(() => {
    const update = () => {
      const now = new Date()
      setClock([now.getHours(), now.getMinutes(), now.getSeconds()]
        .map(n => n.toString().padStart(2, "0"))
        .join(":"))
    }
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [])
  return clock
}

/* Legacy sidebar removed: FieldLoopWorkspace owns the single visible navigation rail. */
function Sidebar({ module, onNavigate }: { module: AppModule; onNavigate: (id: AppModule) => void }) {
  return (
    <aside className="group flex w-14 shrink-0 flex-col border-r border-line bg-recess transition-[width] duration-200 hover:w-[212px] focus-within:w-[212px]">
      <div className="flex items-center gap-2.5 px-3 pb-4 pt-5">
        <div className="btn-primary flex h-8 w-8 items-center justify-center rounded-md text-xs font-black text-on-accent">
          PT
        </div>
        <div className="min-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
          <div className="text-[13px] font-bold tracking-tight">PlumbTrack</div>
          <div className="label-mono text-2xs text-ink-low">HQ CONSOLE</div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-2" aria-label="Modules">
        {NAV.map(item => {
          const Icon = item.icon
          const active = module === item.id
          return (
            <button
              key={item.id}
              data-testid={`nav-${item.id}`}
              disabled={!item.enabled}
              onClick={() => onNavigate(item.id)}
              title={item.label}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors",
                active
                  ? "bg-chrome-wash text-ink ring-1 ring-chrome-400/60"
                  : item.enabled
                    ? "text-ink-mid hover:bg-fill hover:text-ink"
                    : "cursor-not-allowed text-ink-low opacity-50"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 overflow-hidden whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">{item.label}</span>
              {!item.enabled && (
                <span className="label-mono text-2xs text-ink-low">{item.milestone}</span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="overflow-hidden whitespace-nowrap border-t border-line px-3 py-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        <div className="label-mono text-2xs text-ink-low">CAULFIELD SOUTH</div>
        <div className="text-2xs text-ink-low">Plumbing · Melbourne</div>
      </div>
    </aside>
  )
}

function Toolbar({ module }: { module: AppModule }) {
  const [sessionLabel, setSessionLabel] = useState("SESSION CHECKING")
  const [sessionError, setSessionError] = useState(false)
  const [sessionBusy, setSessionBusy] = useState(false)
  const refreshSession = () => {
    setSessionBusy(true)
    void authApi.session().then(session => {
      setSessionError(false)
      setSessionLabel(`${session.role.toUpperCase()} · ${session.organizationId}`)
    }).catch(() => {
      setSessionError(true)
      setSessionLabel("SESSION UNAVAILABLE")
    }).finally(() => setSessionBusy(false))
  }
  useEffect(() => {
    refreshSession()
    const renewal = window.setInterval(() => { void authApi.renew().then(refreshSession).catch(() => setSessionError(true)) }, 15 * 60 * 1000)
    return () => window.clearInterval(renewal)
  }, [])
  const signOut = () => {
    setSessionBusy(true)
    void authApi.signOut().then(() => { setSessionLabel("SIGNED OUT"); setSessionError(true) }).catch(() => setSessionError(true)).finally(() => setSessionBusy(false))
  }
  const clock = useWallClock()
  const setPaletteOpen = useBoardStore(s => s.setPaletteOpen)
  const dataMode = useBoardStore(s => s.dataMode)
  const theme = useBoardStore(s => s.theme)
  const setTheme = useBoardStore(s => s.setTheme)
  const [urlView, setUrlView] = useQueryState("view", parseAsString.withDefault("matrix"))
  const label = NAV.find(item => item.id === module)?.label ?? "Dashboard"
  const setCommsOpen = useBoardStore(s => s.setCommsOpen)
  const slackFeed = useBoardStore(s => s.slackFeed)
  const openCards = slackFeed.filter(c => c.kind === "new-job").length

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-recess/60 px-4 backdrop-blur">
      <h1 className="label-mono text-xs text-ink-mid">{label}</h1>

      {(module === "dispatch" || module === "crews" || module === "jobs" || module === "customers" || module === "forms" || module === "reports") && (
        <div
          className="flex items-center rounded-md border border-line bg-recess p-0.5"
          role="tablist"              aria-label="Dispatch workspace view"
        >
          {(
            [
              { id: "matrix", label: "Crew", icon: Table2 },
              { id: "list", label: "List", icon: Briefcase },
              { id: "calendar", label: "Calendar", icon: CalendarDays },
              { id: "map", label: "Map", icon: MapIcon }
            ] as const
          ).map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={urlView === tab.id}
                data-testid={`view-${tab.id}`}
                onClick={() => void setUrlView(tab.id)}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-[6px] px-3 text-xs font-semibold transition-colors",
                  urlView === tab.id
                    ? "btn-primary text-on-accent"
                    : "text-ink-mid hover:text-ink"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>
      )}

      <div className="ml-auto flex items-center gap-2.5">
        <Button
          variant="outline"
          size="sm"
          data-testid="comms-trigger"
          aria-label="Open Slack dispatch comms"
          className="label-mono relative h-8 gap-1.5 border-line bg-recess px-2.5 text-2xs text-ink-mid hover:text-ink"
          onClick={() => setCommsOpen(true)}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          COMMS
          {openCards > 0 && (
            <span className="tnum rounded-full bg-urgent px-1.5 text-[10px] font-bold text-on-accent">
              {openCards}
            </span>
          )}
        </Button>
        {dataMode === "demo" && (
          <span
            data-testid="demo-badge"
            className="label-mono rounded-full border border-dashed border-line px-2 py-0.5 text-2xs text-ink-low"
          >
            DEMO · API UNREACHABLE
          </span>
        )}
        <button data-testid="session-badge" type="button" onClick={sessionError ? refreshSession : signOut} className="label-mono rounded-full border border-line px-2 py-0.5 text-2xs text-ink-low hover:text-ink disabled:cursor-wait disabled:opacity-60" title={sessionError ? "Retry session" : "Sign out"} aria-label={sessionError ? "Retry session" : "Sign out"} disabled={sessionBusy}>{sessionBusy ? "SESSION WORKING" : sessionLabel}</button>
        <span
          data-testid="live-badge"
          className="label-mono inline-flex items-center gap-1.5 rounded-full border border-chrome-400/40 bg-chrome-wash px-2 py-0.5 text-2xs text-chrome-400"
        >
          <Radio className="h-3 w-3 animate-pulse-soft" />
          LIVE
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2 border-line bg-recess text-xs text-ink-mid hover:text-ink"
          onClick={() => setPaletteOpen(true)}
          data-testid="palette-trigger"
        >
          <Search className="h-3.5 w-3.5" />
          Search
          <kbd className="label-mono rounded border border-line px-1 text-2xs">CTRL K</kbd>
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 border-line bg-recess text-ink-mid hover:text-ink"
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          data-testid="theme-toggle"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <div className="tnum font-mono text-base font-semibold tracking-tight" data-testid="wall-clock">
          {clock}
        </div>
      </div>
    </header>
  )
}

function PlaceholderModule({ id, milestone }: { id: AppModule; milestone: string }) {
  const item = NAV.find(n => n.id === id)
  const Icon = item?.icon ?? FileText
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="panel flex max-w-[320px] flex-col items-center rounded-xl p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-chrome-wash text-chrome-400">
          <Icon className="h-6 w-6" />
        </div>
        <h2 className="mt-3 text-sm font-bold">{item?.label ?? id}</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-mid">
          Scheduled for milestone{" "}
          <span className="label-mono text-chrome-400">{milestone}</span> — see{" "}
          <span className="font-mono text-2xs">APPLICATION_MAP.md</span> for the build order.
        </p>
      </div>
    </div>
  )
}

export function AppShell() {
  // nuqs URL state is the single source of truth for module routing — every
  // useQueryState("module") instance stays in sync, so the sidebar, palette
  // and dashboard cards all navigate through the URL (shareable, back-button
  // friendly, and immune to bidirectional-sync loops).
  const [urlModule, setUrlModule] = useQueryState("module", parseAsString.withDefault("dispatch"))
  const theme = useBoardStore(s => s.theme)
  const activeModule: AppModule = ENABLED.has(urlModule as AppModule)
    ? (urlModule as AppModule)
    : "dashboard"
  const navigate = (id: AppModule): void => {
    void setUrlModule(id)
  }

  // Adopt the persisted theme after hydration, then keep the class in sync
  // with the store. The server and first client render intentionally match.
  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark")
    useBoardStore.setState({ theme: isDark ? "dark" : "light" })
  }, [])
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
  }, [theme])

  return (
    <div className="flex h-dvh w-screen overflow-hidden bg-chrome-void">
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="min-h-0 flex-1">
          {FIELDLOOP_MODULES.has(activeModule) && <FieldLoopWorkspace />}
          {activeModule === "operations" && <OperationsHub />}
          {activeModule === "kanban" && <Board />}
          {activeModule === "calendar" && <Board />}
          {!ENABLED.has(activeModule) && (
            <PlaceholderModule
              id={activeModule}
              milestone={NAV.find(n => n.id === activeModule)?.milestone ?? "later"}
            />
          )}
        </main>
      </div>
      <CommandPalette />
      <SlackCommsPanel />
      <Toaster />
    </div>
  )
}
