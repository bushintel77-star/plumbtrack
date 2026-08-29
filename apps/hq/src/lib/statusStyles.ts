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

export function statusPrecedence(job: Pick<Job, "status" | "priority">): JobStatus {
  if (job.priority === "emergency") return "active"
  return job.status
}

export function statusStyleFor(job: Pick<Job, "status" | "priority">): StatusStyle {
  return statusStyles[statusPrecedence(job)]
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
