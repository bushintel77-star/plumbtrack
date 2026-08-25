import { API_URL, DEFAULT_ORG_ID } from "./constants";
import type { NotificationFeedItem } from "@/types";
import { HttpError } from "./errors";

const ORG_HEADER = "x-organization-id";

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
 * ships in this bundle. Throws when the API is unreachable so callers can
 * fall back to the local store (offline-first).
 */
export async function dispatchNotification(input: NotificationInput): Promise<void> {
  const response = await fetch(`${API_URL}/api/notifications`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [ORG_HEADER]: DEFAULT_ORG_ID,
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new HttpError(response.status, `Notification dispatch failed (${response.status})`);
  }
}

/** Fetch persisted notifications for the HQ feed (API-backed). */
export async function fetchNotifications(): Promise<NotificationFeedItem[]> {
  const response = await fetch(`${API_URL}/api/notifications`, {
    headers: { [ORG_HEADER]: DEFAULT_ORG_ID },
  });
  if (!response.ok) {
    throw new Error(`Notification fetch failed (${response.status})`);
  }
  return (await response.json()) as NotificationFeedItem[];
}

export interface NotificationStatus {
  slackConnected: boolean;
}

/** Ask the dispatcher whether the server-side Slack relay is configured. */
export async function fetchSlackStatus(): Promise<NotificationStatus> {
  const response = await fetch(`${API_URL}/api/notifications/status`, {
    headers: { [ORG_HEADER]: DEFAULT_ORG_ID },
  });
  if (!response.ok) {
    throw new Error(`Notification status failed (${response.status})`);
  }
  return (await response.json()) as NotificationStatus;
}
