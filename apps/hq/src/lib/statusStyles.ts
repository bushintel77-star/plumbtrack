import { Clock, Check, Hourglass, Play, Siren, type LucideIcon } from "lucide-react"
import type { Job, JobStatus, Technician } from "@/types"

export interface StatusStyle {
  badge: string
  chip: string
  label: string
  icon: LucideIcon
}

export const statusStyles: Record<JobStatus, StatusStyle> = {
  unassigned: { badge: "text-ink-low", chip: "bg-fill text-ink-mid", label: "Queued", icon: Clock },
  scheduled: { badge: "text-ink-mid", chip: "bg-fill text-ink", label: "Scheduled", icon: Clock },
  en_route: { badge: "text-chrome-400", chip: "bg-chrome-400 text-on-accent", label: "En route", icon: Clock },
  active: { badge: "text-active", chip: "bg-active text-on-accent", label: "Active", icon: Play },
  delayed: { badge: "text-pending", chip: "bg-pending text-on-accent", label: "Delayed", icon: Hourglass },
  complete: { badge: "text-complete", chip: "bg-complete text-on-accent", label: "Complete", icon: Check }
}

/** Emergency is a display channel above any status: urgent red + siren —
 *  an active emergency must read red, never teal (APPLICATION_MAP §6.2). */
export type StatusChannel = JobStatus | "emergency"

const emergencyStyle: StatusStyle = { badge: "text-urgent", chip: "bg-urgent text-on-accent", label: "Emergency", icon: Siren }

export const channelStyles: Record<StatusChannel, StatusStyle> = {
  ...statusStyles,
  emergency: emergencyStyle
}

/** One precedence order for every surface: emergency > delayed > state. */
export function statusPrecedence(job: Pick<Job, "status" | "priority">): StatusChannel {
  if (job.priority === "emergency") return "emergency"
  if (job.status === "delayed") return "delayed"
  return job.status
}

export function statusStyleFor(job: Pick<Job, "status" | "priority">): StatusStyle {
  return channelStyles[statusPrecedence(job)]
}

export function personOrder(technicians: Technician[]): Technician[] {
  return [...technicians].sort((a, b) => a.id.localeCompare(b.id))
}

const identitySlots = new Map<string, number>()

export function personColor(technician: Technician, technicians: Technician[]): string {
  const roster = personOrder(technicians)
  roster.forEach((item, index) => {
    if (!identitySlots.has(item.id)) identitySlots.set(item.id, index)
  })
  const index = identitySlots.get(technician.id) ?? 0
  return `var(--person-${(index % 4) + 1})`
}

export { Siren }
