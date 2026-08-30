"use client"

import {
  AlertTriangle,
  Check,
  Clock3,
  Flag,
  type LucideIcon
} from "lucide-react"

import {
  dispatchStatus,
  dispatchStatusLabel,
  initialsOf,
  type DispatchStatusKey,
  type ExpiryStatus,
  EXPIRY_LABEL
} from "@/lib/fieldloop"
import { PRESENCE_LABEL } from "@/lib/fieldloop"
import { cn } from "@/lib/utils"
import type { Job, Presence } from "@/types"

/** Icon per board status. Colour is never the only channel (spec §1.2). */
export const STATUS_ICON: Record<DispatchStatusKey, LucideIcon> = {
  urgent: AlertTriangle,
  scheduled: Clock3,
  complete: Check,
  unassigned: Flag
}

export function StatusChip({ job }: { job: Job }) {
  const key = dispatchStatus(job)
  const label = dispatchStatusLabel(job)
  const Icon = STATUS_ICON[key]
  return (
    <span className="fl-status-chip" data-status={key}>
      <Icon size={11} aria-hidden />
      {label}
    </span>
  )
}

export function Avatar({
  name,
  presence,
  size = "md"
}: {
  name: string
  presence?: Presence
  size?: "sm" | "md" | "lg"
}) {
  return (
    <span className={cn("fl-avatar", size === "sm" && "sm", size === "lg" && "lg")}>
      {initialsOf(name)}
      {presence && (
        <span
          className="fl-presence"
          data-presence={presence}
          role="img"
          aria-label={PRESENCE_LABEL[presence]}
          title={PRESENCE_LABEL[presence]}
        />
      )}
    </span>
  )
}

export function ExpiryChip({ status }: { status: ExpiryStatus }) {
  return (
    <span className="fl-expiry-chip" data-expiry={status}>
      {EXPIRY_LABEL[status]}
    </span>
  )
}

export function StatBox({
  value,
  label,
  tone = "default"
}: {
  value: string | number
  label: string
  tone?: "default" | "blue" | "green" | "muted" | "none"
}) {
  return (
    <div className="fl-stat">
      <div className="fl-stat-num" data-tone={tone}>
        {value}
      </div>
      <div className="fl-stat-label">{label}</div>
    </div>
  )
}
