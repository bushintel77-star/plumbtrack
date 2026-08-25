import type { JobCompletedEvent, NotificationCreatedEvent } from "../../domain/events";

export interface SlackTextObject {
  type: "mrkdwn";
  text: string;
}

export interface SlackBlock {
  type: "header" | "section" | "context" | "divider";
  text?: SlackTextObject | { type: "plain_text"; text: string; emoji?: boolean };
  fields?: SlackTextObject[];
  elements?: SlackTextObject[];
}

export interface SlackRenderedMessage {
  text: string;
  blocks: SlackBlock[];
}

/** Rendering wrapper component: consistent job heading and context. */
function JobHeader(event: JobCompletedEvent): SlackBlock {
  return {
    type: "header",
    text: { type: "plain_text", text: `Job completed · ${event.jobId}`, emoji: true },
  };
}

/** Rendering wrapper component: concise operational facts for HQ. */
function JobSummary(event: JobCompletedEvent): SlackBlock {
  const duration = `${Math.floor(event.durationSeconds / 3600)}h ${Math.floor((event.durationSeconds % 3600) / 60)}m`;
  return {
    type: "section",
    fields: [
      { type: "mrkdwn", text: `*Customer*\n${event.client}` },
      { type: "mrkdwn", text: `*Technician*\n${event.technicianId ?? "Field team"}` },
      { type: "mrkdwn", text: `*Time on site*\n${duration}` },
      { type: "mrkdwn", text: `*Evidence*\n${event.photoCount} photo${event.photoCount === 1 ? "" : "s"}` },
    ],
  };
}

/** Rendering wrapper component: completion state and deep-link context. */
function CompletionContext(event: JobCompletedEvent): SlackBlock {
  return {
    type: "context",
    elements: [{
      type: "mrkdwn",
      text: `${event.customerSigned ? "✅ Customer signed" : "⚠️ Signature pending"} · ${event.address}`,
    }],
  };
}

/**
 * Single rendering boundary for the Slack representation of a domain event.
 * A JSX renderer such as jsx-slack can replace this implementation without
 * changing the event contract or adapter/queue code.
 */
export function renderJobCompletedMessage(event: JobCompletedEvent): SlackRenderedMessage {
  return {
    text: `Job completed · ${event.jobId} · ${event.client}`,
    blocks: [JobHeader(event), JobSummary(event), { type: "divider" }, CompletionContext(event)],
  };
}

export function renderNotificationMessage(event: NotificationCreatedEvent): SlackRenderedMessage {
  return {
    text: event.text,
    blocks: [{
      type: "section",
      text: { type: "mrkdwn", text: `*${event.author}*\n${event.text}` },
    }],
  };
}
