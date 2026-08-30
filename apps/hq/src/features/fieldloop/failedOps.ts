"use client"

import { create } from "zustand"

/**
 * Ledger of assignment moves the board applied optimistically and then had to
 * roll back. Retry re-runs the same mutation through the same validation, so a
 * move rejected for a real business reason fails again instead of quietly
 * "working" the second time.
 */
export interface FailedOp {
  id: string
  jobId: string
  jobTitle: string
  techId: string
  techName: string
  startBlock: number
  reason: string
  at: number
}

interface FailedOpsState {
  ops: FailedOp[]
  syncPaneOpen: boolean
  record: (op: Omit<FailedOp, "id" | "at">) => void
  /** Refresh an existing entry after a retry failed again — never duplicate it. */
  refresh: (id: string, reason: string) => void
  discard: (id: string) => void
  clear: () => void
  setSyncPaneOpen: (open: boolean) => void
}

export const useFailedOps = create<FailedOpsState>()(set => ({
  ops: [],
  syncPaneOpen: false,
  record: op =>
    set(state => ({
      ops: [{ ...op, id: `${op.jobId}-${Date.now()}`, at: Date.now() }, ...state.ops].slice(0, 20)
    })),
  refresh: (id, reason) =>
    set(state => ({
      ops: state.ops.map(op => (op.id === id ? { ...op, reason, at: Date.now() } : op))
    })),
  discard: id => set(state => ({ ops: state.ops.filter(op => op.id !== id) })),
  clear: () => set({ ops: [] }),
  setSyncPaneOpen: open => set({ syncPaneOpen: open })
}))
