export interface JobCompletedEvent {
  type: "job.completed";
  eventId: string;
  occurredAt: string;
  organizationId: string;
  jobId: string;
  client: string;
  address: string;
  scope: string;
  technicianId?: string;
  durationSeconds: number;
  photoCount: number;
  customerSigned: boolean;
}

export interface NotificationCreatedEvent {
  type: "notification.created";
  eventId: string;
  occurredAt: string;
  organizationId: string;
  notificationId: string;
  channel: string;
  author: string;
  text: string;
}

/** Emitted when a job is created with no assignable technician — the exact
 *  signal behind the `job.created_unassigned` automation route (§4.6). */
export interface JobCreatedUnassignedEvent {
  type: "job.created_unassigned";
  eventId: string;
  occurredAt: string;
  organizationId: string;
  jobId: string;
  client: string;
  address: string;
  scope: string;
}

/** Emitted when dispatch or the field posts a job message while the org's
 *  Slack job-thread bridge is on — the message is mirrored into that job's
 *  Slack thread. Never emitted for replies that came IN from Slack. */
export interface JobMessagePostedEvent {
  type: "job.message_posted";
  eventId: string;
  occurredAt: string;
  organizationId: string;
  jobId: string;
  messageId: string;
  direction: "dispatch" | "field";
  sender: string;
  body: string;
  client: string;
  address: string;
  scope: string;
}

/** Emitted when dispatch marks a job urgent (P1-4) — the server-side signal
 *  behind the `job.status_urgent` automation route. Never emitted for a
 *  false transition or a no-op write. */
export interface JobUrgentEvent {
  type: "job.status_urgent";
  eventId: string;
  occurredAt: string;
  organizationId: string;
  jobId: string;
  client: string;
  address: string;
  scope: string;
  markedBy: string;
}

export type DomainEvent = JobCompletedEvent | NotificationCreatedEvent | JobCreatedUnassignedEvent | JobMessagePostedEvent | JobUrgentEvent;

export function isDomainEvent(value: unknown): value is DomainEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<DomainEvent>;
  return (
    (event.type === "job.completed" ||
      event.type === "notification.created" ||
      event.type === "job.created_unassigned" ||
      event.type === "job.message_posted" ||
      event.type === "job.status_urgent") &&
    typeof event.eventId === "string" &&
    typeof event.organizationId === "string" &&
    typeof event.occurredAt === "string"
  );
}
