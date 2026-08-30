"use client"

import { useState, type ReactNode } from "react"
import { Info } from "lucide-react"

import { cn } from "@/lib/utils"
import { initialsOf } from "@/lib/fieldloop"
import type { ExpiryState } from "@/lib/fieldloop"
import type { DispatchStatus } from "@/types"

export function Avatar({ name, size }: { name: string; size?: "small" | "large" }) {
  return <span className={cn("fl-avatar", size)}>{initialsOf(name)}</span>
}

const DISPATCH_LABELS: Record<DispatchStatus, string> = {
  urgent: "Urgent",
  scheduled: "Scheduled",
  complete: "Complete",
  unassigned: "Unassigned"
}

export function StatusChip({ status }: { status: DispatchStatus }) {
  return <span className={cn("fl-status", status)}>{DISPATCH_LABELS[status]}</span>
}

const EXPIRY_TONE: Record<ExpiryState, string> = {
  expired: "urgent",
  expiring: "pending",
  valid: "complete",
  on_record: ""
}

export function ExpiryChip({ state, label }: { state: ExpiryState; label: string }) {
  return <span className={cn("fl-status", EXPIRY_TONE[state])}>{label}</span>
}

/**
 * A control for a capability the backend does not have yet. It responds —
 * hover, press, and an explicit explanation of what is missing — but it never
 * reports a success the product cannot deliver.
 */
export function HonestAction({
  children,
  requirement,
  icon
}: {
  children: ReactNode
  /** The production service this action is waiting on. */
  requirement: string
  icon?: ReactNode
}) {
  const [explained, setExplained] = useState(false)
  return (
    <>
      <button type="button" className="fl-honest" onClick={() => setExplained(value => !value)}>
        {icon ?? <Info size={13} />}
        {children}
      </button>
      {explained && (
        <p className="fl-notice" role="status">
          Not available yet — needs {requirement}. Nothing was sent.
        </p>
      )}
    </>
  )
}
