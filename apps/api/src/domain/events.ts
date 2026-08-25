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

export type DomainEvent = JobCompletedEvent | NotificationCreatedEvent;

export function isDomainEvent(value: unknown): value is DomainEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<DomainEvent>;
  return (
    (event.type === "job.completed" || event.type === "notification.created") &&
    typeof event.eventId === "string" &&
    typeof event.organizationId === "string" &&
    typeof event.occurredAt === "string"
  );
}
