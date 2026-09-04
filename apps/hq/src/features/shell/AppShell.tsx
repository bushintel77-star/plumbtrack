"use client"

import { useEffect, useState } from "react"
import { authApi, FORCE_DEMO, HttpError } from "@/lib/api"
import { useQueryState, parseAsString } from "nuqs"
import {
  BarChart3,
  Briefcase,
  Building2,
  CalendarDays,
  FileText,
  LayoutDashboard,
  Map as MapIcon,
  Radio,
  Table2,
  Users,
  Network
} from "lucide-react"

import { useBoardStore } from "@/stores/boardStore"
import type { AppModule } from "@/types"
import { type FieldLoopMode } from "@/features/fieldloop/context"
import { HqSignIn } from "@/features/auth/HqSignIn"
import { useTelemetrySocket } from "@/lib/telemetry"

import { Board } from "@/features/board/Board"
import { CommandPalette } from "@/features/board/CommandPalette"
import { SlackCommsPanel } from "@/features/comms/SlackCommsPanel"
import { Toaster } from "@/components/ui/toaster"
import { OperationsHub } from "@/features/office/OperationsHub"
import { FieldLoopWorkspace, type Surface } from "@/features/fieldloop/FieldLoopWorkspace"

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

/* Modules the FieldLoop workspace now owns. The legacy `module` value still
   decides which surface opens, so existing links and redirects keep landing
   where they always did; `surface` then takes over inside the workspace. */
const FIELDLOOP_MODULES: Partial<Record<AppModule, Surface>> = {
  dashboard: "dispatch",
  dispatch: "dispatch",
  crews: "dispatch",
  jobs: "dispatch",
  map: "map",
  forms: "documents",
  customers: "crm",
  // Accounting has no backend of its own; revenue, recorded cost and margin
  // live on Reports, which is the only honest destination for it today.
  accounting: "reports",
  reports: "reports"
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

/** Map legacy module nav onto FieldLoop modes so the workspace opens the
 *  right tab instead of always defaulting to Dispatch. */
const MODULE_TO_MODE: Partial<Record<AppModule, FieldLoopMode>> = {
  dashboard: "dispatch",
  dispatch: "dispatch",
  map: "map",
  forms: "documents",
  customers: "crm",
  reports: "reports",
  accounting: "reports"
}

export function AppShell() {
  // Live board socket: job status re-colors and fleet telemetry feeds the
  // vehicle symbols. Mounted once per console shell; reconnects on its own.
  useTelemetrySocket()

  // nuqs URL state is the single source of truth for module routing — every
  // useQueryState("module") instance stays in sync, so the sidebar, palette
  // and dashboard cards all navigate through the URL (shareable, back-button
  // friendly, and immune to bidirectional-sync loops).
  const [urlModule, setUrlModule] = useQueryState("module", parseAsString.withDefault("dispatch"))
  const [modeParam, setModeParam] = useQueryState("mode", parseAsString)
  const theme = useBoardStore(s => s.theme)
  const activeModule: AppModule = ENABLED.has(urlModule as AppModule)
    ? (urlModule as AppModule)
    : "dashboard"

  useEffect(() => {
    const mapped = MODULE_TO_MODE[activeModule]
    if (mapped && mapped !== modeParam) {
      void setModeParam(mapped)
    }
  }, [activeModule, modeParam, setModeParam])

  const navigate = (id: AppModule): void => {
    void setUrlModule(id)
    const mapped = MODULE_TO_MODE[id]
    if (mapped) void setModeParam(mapped)
  }
  const fieldLoopSurface = FIELDLOOP_MODULES[activeModule]

  // Adopt the persisted theme after hydration, then keep the class in sync
  // with the store. The server and first client render intentionally match.
  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark")
    useBoardStore.setState({ theme: isDark ? "dark" : "light" })
  }, [])
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
  }, [theme])

  // Station session gate. A 401 from the API means production auth is on and
  // this browser has no session — show sign-in instead of falling back to
  // demo data. Network failures keep the demo fallback so the offline board
  // stays usable, and FORCE_DEMO (Playwright/demos) never gates.
  const [authGate, setAuthGate] = useState<"checking" | "open" | "signed-in">("checking")
  useEffect(() => {
    if (FORCE_DEMO) {
      setAuthGate("signed-in")
      return
    }
    let alive = true
    authApi
      .session()
      .then(() => {
        if (alive) setAuthGate("signed-in")
      })
      .catch((error: unknown) => {
        if (!alive) return
        setAuthGate(error instanceof HttpError && error.status === 401 ? "open" : "signed-in")
      })
    return () => {
      alive = false
    }
  }, [])

  // Mid-session expiry: the board poll reports a 401 through
  // useBoardLifecycle (window event — the lifecycle hook has no render
  // relationship to this gate). Without this the console would sit on demo
  // data until the next full reload.
  useEffect(() => {
    const onSessionExpired = (): void => {
      if (!FORCE_DEMO) setAuthGate("open")
    }
    window.addEventListener("plumbtrack:session-expired", onSessionExpired)
    return () => window.removeEventListener("plumbtrack:session-expired", onSessionExpired)
  }, [])

  const handleSignedIn = (): void => {
    // Re-arm the board query: a previous 401 may have flipped dataMode to
    // demo, which suspends refetching; "connecting" re-enables live hydration.
    useBoardStore.setState({ dataMode: "connecting" })
    setAuthGate("signed-in")
  }

  return (
    <div className="flex h-dvh w-screen overflow-hidden bg-chrome-void">
      {authGate === "open" ? (
        <HqSignIn onSignedIn={handleSignedIn} />
      ) : authGate === "checking" ? (
        // Hold the console back until the gate resolves — the store boots with
        // seed data, and rendering it before the 401 lands leaks fictional
        // jobs/clients to an unauthenticated visitor.
        null
      ) : (
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="min-h-0 flex-1">
            {fieldLoopSurface && <FieldLoopWorkspace moduleSurface={fieldLoopSurface} />}
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
      )}
      <CommandPalette />
      <SlackCommsPanel />
      <Toaster />
    </div>
  )
}
