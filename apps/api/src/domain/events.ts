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

export type DomainEvent = JobCompletedEvent | NotificationCreatedEvent | JobCreatedUnassignedEvent | JobMessagePostedEvent;

export function isDomainEvent(value: unknown): value is DomainEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<DomainEvent>;
  return (
    (event.type === "job.completed" ||
      event.type === "notification.created" ||
      event.type === "job.created_unassigned" ||
      event.type === "job.message_posted") &&
    typeof event.eventId === "string" &&
    typeof event.organizationId === "string" &&
    typeof event.occurredAt === "string"
  );
}
