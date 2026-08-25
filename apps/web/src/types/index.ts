/** Domain types for PlumbTrack — the single source of truth. */

export type JobStatus = "scheduled" | "in_progress" | "completed";
export type QuoteStatus = "draft" | "sent" | "accepted";
export type Tab = "jobs" | "quotes" | "messages" | "settings" | "dashboard";
export type View =
  | "list"
  | "job"
  | "signoff"
  | "invoice"
  | "quote"
  | "quoteSignoff"
  | "gpsLock"
  | "notificationFeed"
  | "syncCenter"
  | "integrationHealth"
  | "timesheet"
  | "dailyReport"
  | "checklist"
  | "dashboard";

export interface TimeEntry {
  id: string;
  /** Staff member id (from SlackMember) who recorded this time. */
  staffId: string;
  /** ISO-8601 UTC timestamp. */
  start: string;
  /** ISO-8601 UTC timestamp, or null while clock is running. */
  end: string | null;
  /** GPS coordinates captured at clock-in (null when unavailable). */
  lat: number | null;
  lng: number | null;
}

export interface JobPhoto {
  id: string;
  label: string;
  url: string;
  /** ISO-8601 UTC timestamp captured locally or returned by the API. */
  takenAt?: string;
}

export type ResidentialJobType = "emergency" | "hot_water" | "general_maintenance" | "gas_compliance" | "blocked_drain";

export interface ServiceItem {
  id: string;
  description: string;
  qty: number;
  unit: string;
  rate: number;
  source: "kit" | "custom";
}

export interface VoiceNote {
  id: string;
  transcript: string;
  createdAt: string;
  createdBy: string;
}

export interface SafetyConfirmation {
  waterIsolated: boolean;
  gasChecked: boolean;
  pressureTested: boolean;
  notes: string;
}

// ── Production log — quantities installed, observations, incidents ──────────

export type LogEntryKind = "production" | "observation" | "incident";

export interface LogEntry {
  id: string;
  kind: LogEntryKind;
  description: string;
  quantity?: number;
  unit?: string;
  photoUrls: string[];
  /** ISO-8601 UTC timestamp. */
  createdAt: string;
  createdBy: string;
}

// ── Daily reports (Raken-style per-day per-job summary) ────────────────────

export interface ReportMaterial {
  id: string;
  description: string;
  qty: number;
  unit: string;
  rate: number;
  /** Links a logged material back to a quote line when applicable. */
  quoteLineId?: string;
}

export interface DailyReport {
  id: string;
  jobId: string;
  /** YYYY-MM-DD */
  date: string;
  weather: string;
  crewIds: string[];
  workCompleted: string;
  /** Legacy display field retained for persisted reports and API compatibility. */
  materialsUsed: string;
  /** Structured materials used on site; absent on reports created by older builds. */
  materials?: ReportMaterial[];
  delays: string;
  visitorLog: string;
  productionEntries: string[];
  checklistIds: string[];
  photoIds: string[];
  submittedAt: string | null;
}

// ── Safety checklists ──────────────────────────────────────────────────────

export interface ChecklistItem {
  id: string;
  question: string;
  result: "pass" | "fail" | "na" | null;
  notes: string;
  photoUrl: string;
}

export interface Checklist {
  id: string;
  jobId: string;
  title: string;
  category: "swms" | "site-safety" | "equipment" | "hot-works";
  items: ChecklistItem[];
  completedAt: string | null;
  completedBy: string | null;
}

// ── Milestones / Progress claims ────────────────────────────────────────────

export interface Milestone {
  id: string;
  label: string;
  percentage: number;
  amount: number;
  status: "pending" | "claimed" | "approved" | "paid";
  claimedAt: string | null;
  paidAt: string | null;
  paymentUrl: string | null;
}

export interface Job {
  id: string;
  client: string;
  address: string;
  scope: string;
  phone?: string;
  accessCode?: string;
  customerId?: string | null;
  propertyId?: string | null;
  jobType?: ResidentialJobType;
  status: JobStatus;
  signature: string | null;
  quoteId?: string | null;
  xeroSyncedAt?: string | null;
  retentionPercent?: number;
  timeEntries: TimeEntry[];
  photos: JobPhoto[];
  serviceItems?: ServiceItem[];
  voiceNotes?: VoiceNote[];
  safetyConfirmation?: SafetyConfirmation;
  logEntries: LogEntry[];
  dailyReports: DailyReport[];
  checklists: Checklist[];
  milestones: Milestone[];
}

export type QuoteLineField = "desc" | "qty" | "unit" | "rate";

export interface QuoteLine {
  id: string;
  desc: string;
  qty: number;
  unit: string;
  rate: number;
}

export interface Quote {
  id: string;
  client: string;
  address: string;
  description: string;
  status: QuoteStatus;
  signature: string | null;
  lines: QuoteLine[];
}

// ── Slack messaging ─────────────────────────────────────────────────────────

export type SlackChannelType = "channel" | "dm";

export interface SlackChannel {
  id: string;
  type: SlackChannelType;
  name: string;
  description?: string;
  /** ISO-8601 UTC timestamp of last read; messages after this count as unread. */
  lastReadAt: string | null;
}

export type SlackMemberRole = "owner" | "admin" | "member" | "bot";

export interface SlackMember {
  id: string;
  name: string;
  role: SlackMemberRole;
  /** Slack-style avatar colour (initials rendered on it). */
  color: string;
  presence: "active" | "away";
}

export interface SlackMessage {
  id: string;
  channelId: string;
  authorId: string;
  text: string;
  /** ISO-8601 UTC timestamp. */
  ts: string;
  /** Optional emoji reactions keyed by emoji, e.g. { "👍": 2 }. */
  reactions: Record<string, number>;
}

// ── Offline sync queue (field mutations → API/integrations) ───────────────

/**
 * A pending write to replay against the API when connectivity returns.
 * Clock-in ops create a server entry; clock-out ops close it. Ops are
 * replayed in order, and a clock-out resolves its target via `serverEntryIds`
 * once the matching clock-in has been acknowledged by the server.
 */
export type SyncOp =
  | {
      kind: "clock-in";
      opId: string;
      jobId: string;
      /** Local entry id this op created. */
      localEntryId: string;
      payload: { staffId: string; start: string; lat: number | null; lng: number | null };
    }
  | {
      kind: "clock-out";
      opId: string;
      jobId: string;
      /** Local entry id this op closes. */
      localEntryId: string;
      payload: { end: string };
      dependsOn?: string[];
    }
  | {
      kind: "create-job";
      opId: string;
      /** Local job id (temporary, e.g. J-XXXX). */
      localJobId: string;
      payload: { client: string; address: string; scope: string; phone?: string; accessCode?: string };
    }
  | {
      kind: "sync-quote";
      opId: string;
      quoteId: string;
      payload: { status: QuoteStatus; signature?: string };
    }
  | {
      kind: "notification";
      opId: string;
      payload: { text: string; channel: string; author: string };
      dependsOn?: string[];
    };

export type OutboxOperationKind = SyncOp["kind"] | "photo-upload";
export type OutboxOperationStatus = "pending" | "processing" | "failed_requires_user_action";

export interface OutboxOperation {
  id: string;
  kind: OutboxOperationKind;
  payload: unknown;
  createdAt: string;
  retryCount: number;
  nextRetryTimestamp: number;
  status: OutboxOperationStatus;
  dependsOn?: string[];
  lastError?: string;
}

export interface OutboxMediaRecord {
  id: string;
  data: Blob | string;
  mimeType: string;
  fileName?: string;
  createdAt: string;
}

export type ActivityKind = "time" | "photo" | "note" | "material" | "safety" | "signature" | "invoice";

export interface JobActivity {
  id: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  createdAt: string;
  staffId?: string;
}

// ── Notification feed (API-backed) ─────────────────────────────────────────

export interface NotificationFeedItem {
  id: string;
  channel: string;
  author: string;
  text: string;
  slackDelivered: boolean;
  slackError: string | null;
  /** ISO-8601 UTC timestamp. */
  createdAt: string;
}

/** Shape of persisted state. */
export interface AppState {
  jobs: Job[];
  quotes: Quote[];
  channels: SlackChannel[];
  members: SlackMember[];
  messages: SlackMessage[];
  /** Pending writes to replay against the API and downstream integrations. */
  syncQueue: SyncOp[];
  /** Local time-entry id → server id, once a clock-in op has been acknowledged. */
  serverEntryIds: Record<string, string>;
}
