export type JobPriority = "emergency" | "high" | "normal"
/** Research state machine: unassigned → scheduled → en_route → active(in
 *  progress) → complete; `delayed` is a runtime flag any state can assume. */
export type JobStatus =
  | "unassigned"
  | "scheduled"
  | "en_route"
  | "active"
  | "complete"
  | "delayed"
export type QuoteStatus = "draft" | "ready" | "sent" | "approved"

/** Resource roles (UI concept: Technician, Electrician, Installer, Driver, Sweeper). */
export const ROLES = [
  "Technician",
  "Electrician",
  "Installer",
  "Driver",
  "Sweeper"
] as const
export type Role = (typeof ROLES)[number]

/** Approved absence window — hashed, un-droppable row time on the canvas. */
export interface Absence {
  /** Inclusive ISO day. */
  from: string
  /** Inclusive ISO day. */
  to: string
  reason: string
}

export interface LineItem {
  id: string
  description: string
  qty: number
  unitPrice: number
}

export interface Quote {
  clientName: string | null
  lineItems: LineItem[] | null
  status: QuoteStatus
  notes?: string
}

export const DOC_CATEGORIES = [
  "Compliance & Licenses",
  "Vehicles",
  "Job Records"
] as const
export type DocCategory = (typeof DOC_CATEGORIES)[number]

export interface ComplianceDoc {
  id: string
  name: string
  ref: string
  /** ISO date — vault flags amber ≤30 days out, red once expired. `null`
   *  means the record simply has no expiry, which is not an alarm. */
  expiresAt: string | null
  category?: DocCategory
  /** Who or what the record belongs to. */
  entityType?: "technician" | "vehicle" | "company"
  entityId?: string
  /** Human label for the owning entity (technician name, van, company). */
  owner?: string
  docType?: string
  issuedAt?: string
  linkedJobId?: string
  /** Signed URL to the stored file — never populated until file storage exists. */
  fileUrl?: string | null
}

/** Recurring service commitment against a customer. */
export interface ServiceAgreement {
  id: string
  customerName: string
  serviceType: string
  frequency: string
  lastServiceDate: string
  /** ISO day — same expiry maths as the document vault. */
  nextDueDate: string
}

export interface GeoPoint {
  lat: number
  lng: number
}

/** A single position captured at clock-in or clock-out. Never a continuous
 *  feed — see the location policy in the FieldLoop design spec §8. */
export interface CapturedLocation extends GeoPoint {
  capturedAt: string
}

export const REGIONS = ["north", "inner", "west", "south-east"] as const
export type Region = (typeof REGIONS)[number]

export const JOB_TYPES = ["repair", "install", "maintenance", "inspection"] as const
export type JobType = (typeof JOB_TYPES)[number]

export interface Job {
  id: string
  title: string
  client: string
  address: string
  priority: JobPriority
  /** Skill tag the assigned technician must hold (BR-04 constraint). */
  requiredSkill?: string
  /** Service territory — noise-reduction filter + travel estimation. */
  region?: Region
  /** Work category filter. */
  jobType?: JobType
  /** Site coordinates — drive travel buffers and map pins. */
  location?: GeoPoint
  techId: string | null
  startBlock: number
  spanBlocks: number
  /** ISO day (YYYY-MM-DD) for the planned service day; absent = today. */
  scheduledDate?: string
  /** Multi-day linked schedules: fragments share a group id + color token. */
  linkedGroupId?: string
  status: JobStatus
  elapsedSeconds: number
  timerRunning: boolean
  clockOnCount: number
  quote: Quote
  documents: ComplianceDoc[]
  /**
   * Actual labour + materials outlay for the visit, in dollars. `null` until
   * the office records it — margin is reported as unavailable rather than
   * estimated from a multiplier, because a fabricated cost makes every
   * margin figure on the Reports tab meaningless.
   */
  cost?: number | null
}

/** Point-in-time position captured at clock-in/clock-out ONLY.
 *  Continuous tracking is a deliberate non-capability — see
 *  FIELDLOOP_DESIGN_REFERENCES.md and the design spec §8. */
export interface LastKnownLocation {
  point: GeoPoint
  /** ISO timestamp of the clock-in/clock-out that captured it. */
  capturedAt: string
}

/** Derived, never stored: on_leave from approved absences, on_job from an
 *  in-flight job, available otherwise. `offline` requires a real signal. */
export type Presence = "on_job" | "available" | "on_leave" | "offline"

export interface Technician {
  id: string
  name: string
  van: string
  /** Only ever populated at clock-in/clock-out. Absent = no marker at all. */
  lastKnownLocation?: LastKnownLocation
  /** Skills held — drag targets without the required skill are invalid (BR-04). */
  skills: string[]
  /** Resource role — Y-axis team filtering (Technician/Installer/…). */
  role: Role
  /** Approved absences — hashed, un-droppable row windows + availability. */
  absences: Absence[]
  /** Position captured at the last clock-in/clock-out only. Absent when the
   *  technician has not clocked on, in which case no map pin is drawn. */
  lastKnownLocation?: CapturedLocation
}

/** Three visually distinct crew states — on-leave must never read as idle. */
export type Presence = "on_job" | "available" | "on_leave"

/** The four board states the dispatch surfaces speak, collapsed from the
 *  internal FSM so every surface colours a job identically. */
export type DispatchStatus = "urgent" | "scheduled" | "complete" | "unassigned"

export type AttentionKind = "overrun" | "tight-travel" | "unassigned"
export type Severity = "red" | "amber" | "blue" | "green"

/** Computed, never stored — one definition shared by every surface so the
 *  board, the inspector and any future client can never drift. */
export interface AttentionFlag {
  id: string
  kind: AttentionKind
  severity: Exclude<Severity, "green">
  jobId: string
  title: string
  detail: string
}

export interface ChatMessage {
  id: string
  author: string
  body: string
  minutesAgo: number
}

export interface Channel {
  id: string
  name: string
  unread: number
  messages: ChatMessage[]
  /** Temporary on-site incident channels archive when the job completes. */
  archived?: boolean
}

/** Slack bridge card lifecycle — mirrors the FSM state machine: a new
 *  unassigned job alerts the #dispatch-queue, claiming rewrites the card,
 *  en-route disables the action and adds an ETA, on-site spins up a
 *  #job-{id} channel, completion archives it. */
export type SlackCardKind = "new-job" | "claimed" | "en-route" | "on-site" | "complete"

export interface SlackDispatchCard {
  id: string
  jobId: string
  kind: SlackCardKind
  /** Slack channel the card posts to (Block Kit surface name). */
  channel: string
  title: string
  client: string
  body: string
  /** Live drive-time estimate in minutes (en-route cards). */
  etaMinutes?: number
  /** Technician who claimed via the interactive Accept button. */
  claimedBy?: string | null
  actionsDisabled: boolean
  ts: number
}

export interface SendQuoteResult {
  ok: boolean
  reason?: string
}

export interface AssignCheck {
  ok: boolean
  reason?: string
}

/** Board data provenance — live API when reachable, seeded demo otherwise. */
export type DataMode = "connecting" | "live" | "demo"

/** App shell modules (Arrivy topology — sidebar navigation). */
export type AppModule =
  | "dashboard"
  | "dispatch"
  | "operations"
  | "kanban"
  | "calendar"
  | "map"
  | "crews"
  | "jobs"
  | "customers"
  | "forms"
  | "reports"
  | "accounting"

export const SKILLS = ["drainage", "gas", "hot-water", "leak-detection", "general"] as const
export type Skill = (typeof SKILLS)[number]
