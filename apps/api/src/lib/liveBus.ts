/**
 * Live event bus — ephemeral in-process fan-out for real-time clients
 * (field devices, HQ console). This is deliberately NOT durable: the
 * transactional domain-event outbox remains the reliability path for
 * integrations (Slack); the bus only carries the newest state to whoever
 * is connected right now. Missed frames are reconciled by the client's
 * refresh-on-reconnect.
 *
 * Frames use the topic-discriminated envelope the HQ socket client
 * already parses: { topic, ...fields }, e.g.
 *   { topic: "topic/jobs/status", jobId, status }
 */

export type LiveFrame =
  | { topic: "topic/jobs/created"; orgId: string; job: unknown }
  | { topic: "topic/jobs/updated"; orgId: string; jobId: string; patch: Record<string, unknown> }
  | { topic: "topic/jobs/status"; orgId: string; jobId: string; status: string }
  | { topic: "topic/jobs/activity"; orgId: string; jobId: string; activity: "clock-in" | "clock-out"; entryId: string }
  | {
      topic: "topic/jobs/checklist";
      orgId: string;
      jobId: string;
      itemId: string;
      label: string;
      completedAt: string | null;
    }
  | {
      topic: "topic/fleet/telemetry";
      orgId: string;
      vehicleId: string;
      techId: string | null;
      lat: number;
      lng: number;
      heading: number | null;
      speed: number | null;
      presence: "on_job" | "on_break";
      timestamp: string;
    }
  | {
      topic: "topic/jobs/message";
      orgId: string;
      jobId: string;
      message: { id: string; direction: "dispatch" | "field"; sender: string; body: string; createdAt: string };
    };

type Listener = (frame: LiveFrame) => void;

const orgChannels = new Map<string, Set<Listener>>();

/** Subscribe to one org's channel. Returns the unsubscribe function. */
export function subscribeOrg(orgId: string, listener: Listener): () => void {
  let channel = orgChannels.get(orgId)
  if (!channel) {
    channel = new Set()
    orgChannels.set(orgId, channel)
  }
  channel.add(listener)
  return () => {
    const listeners = orgChannels.get(orgId)
    if (!listeners) return
    listeners.delete(listener)
    if (listeners.size === 0) orgChannels.delete(orgId)
  }
}

/** Publish a frame to every live subscriber in the org. Never throws —
 *  live delivery must not be able to fail a mutation response. */
export function publishToOrg(frame: LiveFrame): void {
  const listeners = orgChannels.get(frame.orgId)
  if (!listeners) return
  for (const listener of listeners) {
    try {
      listener(frame)
    } catch {
      // A broken subscriber must not break the others.
    }
  }
}

/** Test/teardown helper. */
export function clearLiveBus(): void {
  orgChannels.clear()
}
