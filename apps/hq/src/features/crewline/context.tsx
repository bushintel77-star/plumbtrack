"use client"

import { createContext, useContext } from "react"

import type { AttentionFlag, DerivedCustomer } from "@/lib/crewline"
import type { ComplianceDoc, Job, ServiceAgreement, Technician } from "@/types"

export type CrewlineMode = "dispatch" | "map" | "documents" | "crm" | "reports"
export type BoardZoom = "day" | "week" | "month"

/**
 * One inspector, many states. The right-hand panel routes between these rather
 * than stacking panels, and every mode that has meaningful proactive content
 * defaults to showing it instead of a "select something" placeholder
 * (design spec §1.3, §4.4).
 */
export type InspectorPane =
  | "attention"
  | "job"
  | "sync"
  | "crm-attention"
  | "customer"
  | "docs-overview"
  | "document"

export type ConnectionState = "live" | "offline" | "reconnecting"

/** A write the server rejected. Honest about *why*, so Retry can fail again. */
export interface FailedOp {
  id: string
  title: string
  detail: string
  /** Retrying a genuine business-rule rejection must not silently succeed. */
  retry: () => { ok: boolean; reason?: string }
}

export interface CrewlineContextValue {
  /* Data */
  jobs: Job[]
  technicians: Technician[]
  /** Jobs on the currently selected board day. */
  dayJobs: Job[]
  documents: ComplianceDoc[]
  agreements: ServiceAgreement[]
  customers: DerivedCustomer[]
  flags: AttentionFlag[]
  /** Minutes since midnight — drives live now-line and attention flags. */
  now: number

  /* View state (mirrored into the URL so a view is shareable) */
  mode: CrewlineMode
  setMode: (mode: CrewlineMode) => void
  zoom: BoardZoom
  setZoom: (zoom: BoardZoom) => void
  /** ISO day the board is showing. */
  boardDay: string
  setBoardDay: (isoDayString: string) => void
  highlightedTechId: string | null
  toggleHighlight: (techId: string) => void
  clearHighlight: () => void

  /* Inspector */
  pane: InspectorPane
  showPane: (pane: InspectorPane) => void
  openJobId: string | null
  openJob: (jobId: string) => void
  closeJob: () => void
  openCustomerName: string | null
  openCustomer: (name: string) => void
  openDocumentId: string | null
  openDocument: (docId: string) => void

  /* Connection + failures */
  connection: ConnectionState
  failedOps: FailedOp[]
  pushFailedOp: (op: FailedOp) => void
  retryFailedOp: (id: string) => void
  discardFailedOp: (id: string) => void

  /* Feedback */
  toast: (message: string) => void
  /** Palette control, shared by the topbar search and the ⌘K handler. */
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
}

export const CrewlineContext = createContext<CrewlineContextValue | null>(null)

export function useCrewline(): CrewlineContextValue {
  const value = useContext(CrewlineContext)
  if (!value) throw new Error("useCrewline must be used inside CrewlineWorkspace")
  return value
}
