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

export interface ComplianceDoc {
  id: string
  name: string
  ref: string
  /** ISO date — vault flags amber ≤30 days out, red once expired. */
  expiresAt: string
}

export interface GeoPoint {
  lat: number
  lng: number
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
}

export interface Technician {
  id: string
  name: string
  van: string
  /** Skills held — drag targets without the required skill are invalid (BR-04). */
  skills: string[]
  /** Resource role — Y-axis team filtering (Technician/Installer/…). */
  role: Role
  /** Approved absences — hashed, un-droppable row windows + availability. */
  absences: Absence[]
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
  | "calendar"
  | "map"
  | "crews"
  | "jobs"
  | "customers"
  | "forms"
  | "reports"

export const SKILLS = ["drainage", "gas", "hot-water", "leak-detection", "general"] as const
export type Skill = (typeof SKILLS)[number]
