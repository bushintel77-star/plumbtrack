"use client"

import { createContext, useContext } from "react"

import type { AttentionFlag, DerivedCustomer } from "@/lib/fieldloop"
import type { ComplianceDoc, Job, ServiceAgreement, Technician } from "@/types"

export type FieldLoopMode = "dispatch" | "map" | "documents" | "crm" | "reports"
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

export interface FieldLoopContextValue {
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
  mode: FieldLoopMode
  setMode: (mode: FieldLoopMode) => void
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

export const FieldLoopContext = createContext<FieldLoopContextValue | null>(null)

export function useFieldLoop(): FieldLoopContextValue {
  const value = useContext(FieldLoopContext)
  if (!value) throw new Error("useFieldLoop must be used inside FieldLoopWorkspace")
  return value
}
