import { request } from "./api";
import type { NotificationFeedItem } from "@/types";

export interface NotificationInput {
  text: string;
  /** In-app channel id (e.g. "field-updates", "dm-sarah") — routing policy lives server-side. */
  channel: string;
  author: string;
  /** Durable outbox key; the server uses it to make replay safe. */
  opId?: string;
}

/**
 * Dispatch a notification to the backend dispatcher. The backend routes it
 * internally first (persisted to Postgres, the source of truth) and relays to
 * Slack downstream via a server-side incoming webhook — no Slack URL ever
 * ships in this bundle. Goes through the shared authenticated `request`
 * wrapper (session bearer + timeout + retryable/terminal error split), so
 * production's fail-closed tenant plugin accepts the call and a transient
 * failure is retryable instead of terminally failing the outbox op. Throws
 * when the API is unreachable so callers can fall back to the local store
 * (offline-first).
 */
export async function dispatchNotification(input: NotificationInput): Promise<void> {
  await request("/api/notifications", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Fetch persisted notifications for the HQ feed (API-backed). */
export async function fetchNotifications(): Promise<NotificationFeedItem[]> {
  return request<NotificationFeedItem[]>("/api/notifications");
}

export interface NotificationStatus {
  slackConnected: boolean;
}

/** Ask the dispatcher whether the server-side Slack relay is configured. */
export async function fetchSlackStatus(): Promise<NotificationStatus> {
  return request<NotificationStatus>("/api/notifications/status");
}
