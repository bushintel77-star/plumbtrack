/** Field subset of the PlumbTrack domain — mirrors apps/web/src/types so
 *  the API contract stays identical between field clients. */

export type JobStatus = "scheduled" | "in_progress" | "completed"

export interface ChecklistItem {
  id: string
  label: string
  sortOrder: number
  completedAt: string | null
  completedBy: string | null
}

export type ResidentialJobType =
  | "emergency"
  | "hot_water"
  | "general_maintenance"
  | "gas_compliance"
  | "blocked_drain"

export interface TimeEntry {
  id: string
  staffId: string
  start: string
  end: string | null
  lat: number | null
  lng: number | null
}

export interface JobPhoto {
  id: string
  jobId: string
  /** Local URI before upload completes; asset URL after. */
  uri: string
  createdAt: string
  syncedAt?: string | null
}

export interface ServiceItem {
  id: string
  description: string
  qty: number
  unit: string
  rate: number
  source: "kit" | "custom"
}

export interface Job {
  id: string
  client: string
  address: string
  scope: string
  phone?: string
  accessCode?: string
  jobType?: ResidentialJobType
  status: JobStatus
  /** Approximate site coordinates for the map tab — absent until the API
   *  carries geocoded locations; demo data provides Caulfield-area pins. */
  location?: { lat: number; lng: number }
  timeEntries: TimeEntry[]
  photos: JobPhoto[]
  serviceItems?: ServiceItem[]
  /** Site checklist — v1 local-state only until a checklist write API lands. */
  checklists?: ChecklistItem[]
}

// ── Shift (MA000036) ────────────────────────────────────────────────────────

export type ShiftWorkType = "standard" | "callback" | "inclement"

export interface ShiftBreak {
  start: string
  end: string | null
}

export interface Shift {
  id: string
  staffId: string
  workType: ShiftWorkType
  loggedOnAt: string
  loggedOffAt: string | null
  breaks: ShiftBreak[]
  /** Compliance acknowledgement for the visible GPS-evidence indicator. */
  trackingNoticeAckAt?: string | null
  logOnLat?: number | null
  logOnLng?: number | null
  kmDriven?: number | null
  toilElection?: boolean
}

// ── Session ─────────────────────────────────────────────────────────────────

export interface DeviceSession {
  token: string
  organizationId: string
  role: string
  expiresAt: string
}

// ── Live stream frames (topic-discriminated, mirrors apps/api liveBus) ─────

export type LiveFrame =
  | { topic: "topic/stream/hello"; orgId: string }
  | { topic: "topic/stream/ping" }
  | { topic: "topic/stream/error"; reason: string }
  | { topic: "topic/jobs/created"; job: Job }
  | { topic: "topic/jobs/updated"; jobId: string; patch: Partial<Job> }
  | { topic: "topic/jobs/status"; jobId: string; status: JobStatus }
  | { topic: "topic/jobs/activity"; jobId: string; activity: "clock-in" | "clock-out"; entryId: string }
  | {
      topic: "topic/jobs/checklist"
      jobId: string
      itemId: string
      label: string
      completedAt: string | null
    }

// ── Offline outbox ──────────────────────────────────────────────────────────

export type OutboxKind =
  | "clock-in"
  | "clock-out"
  | "photo-upload"
  | "complete-job"
  | "checklist-item"

export type OutboxStatus = "pending" | "failed" | "failed_requires_user_action"

/**
 * One queued mutation. `id` doubles as the server idempotency key (opId):
 * a retry after a crashed upload must never double-write.
 */
export interface OutboxOperation {
  id: string
  kind: OutboxKind
  payload: Record<string, unknown>
  createdAt: string
  retryCount: number
  nextRetryTimestamp: number
  status: OutboxStatus
  dependsOn: string[]
  lastError?: string | null
}
