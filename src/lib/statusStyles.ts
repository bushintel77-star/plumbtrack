import { Check, Clock, Hourglass, Play, Siren } from "lucide-react-native"

import type { Job, JobStatus } from "@/types"

/**
 * Semantic status contract (FieldLoop) — the mobile face of the same law
 * that governs apps/hq: teal = billing now, red = urgent/emergency, amber =
 * attention, green = complete, muted = queued. Never colour alone — every
 * channel carries a label and an icon (mobile-fsm-ui-design §status system).
 */

export interface StatusStyle {
  /** Chip container classes (bg + text on our custom utilities). */
  chip: string
  label: string
  icon: typeof Play
}

export const statusStyles: Record<JobStatus, StatusStyle> = {
  scheduled: { chip: "bg-surface text-ink-muted", label: "Scheduled", icon: Clock },
  in_progress: { chip: "bg-active text-white", label: "On site", icon: Play },
  completed: { chip: "bg-success text-white", label: "Done", icon: Check }
}

/** Emergency rides above any status — urgent red + siren, never teal. */
const emergencyStyle: StatusStyle = { chip: "bg-danger text-white", label: "Emergency", icon: Siren }

export type StatusChannel = JobStatus | "emergency"

export function statusChannel(job: Pick<Job, "status" | "jobType">): StatusChannel {
  if (job.jobType === "emergency" && job.status !== "completed") return "emergency"
  return job.status
}

export function statusStyleFor(job: Pick<Job, "status" | "jobType">): StatusStyle {
  const channel = statusChannel(job)
  return channel === "emergency" ? emergencyStyle : statusStyles[channel]
}

/** Amber attention channel for the sync badge and queued writes. */
export const pendingStyle: StatusStyle = { chip: "bg-warning text-white", label: "Queued", icon: Hourglass }
