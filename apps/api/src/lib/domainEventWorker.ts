import { randomUUID } from "node:crypto";
import { prisma } from "@plumbtrack/database";
import { isDomainEvent, type DomainEvent } from "../domain/events";
import type { IntegrationRouter } from "../integrations/IntegrationRouter";

const DEFAULT_INTERVAL_MS = 5_000;
const CLAIM_SIZE = 25;
const LEASE_MS = 60_000;
const MAX_ATTEMPTS = 8;
const MAX_BACKOFF_MS = 15 * 60_000;

interface ClaimedDomainEvent {
  eventId: string;
  organizationId: string;
  type: string;
  payload: unknown;
  attempts: number;
  leaseId: string | null;
}

function backoff(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, 2_000 * (2 ** Math.max(0, attempts - 1)));
}

async function recoverExpiredLeases(): Promise<void> {
  await prisma.domainEventOutbox.updateMany({
    where: { status: "processing", lockedUntil: { lt: new Date() } },
    data: { status: "pending", leaseId: null, lockedAt: null, lockedUntil: null },
  });
}

/**
 * Claims pending events in one database statement. `FOR UPDATE SKIP LOCKED`
 * lets multiple API workers consume the queue without taking each other's
 * events, while the conditional UPDATE protects the lease boundary.
 */
export async function claimDomainEvents(
  limit = CLAIM_SIZE,
  leaseMs = LEASE_MS,
): Promise<ClaimedDomainEvent[]> {
  const leaseId = randomUUID();
  const rows = await prisma.$queryRaw<ClaimedDomainEvent[]>`
    WITH candidates AS (
      SELECT "eventId"
      FROM "domain_event_outbox"
      WHERE "status" = 'pending'
        AND ("lockedUntil" IS NULL OR "lockedUntil" < NOW())
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE "domain_event_outbox" AS event
    SET "status" = 'processing'::"DomainEventOutboxStatus",
        "attempts" = event."attempts" + 1,
        "leaseId" = ${leaseId},
        "lockedAt" = NOW(),
        "lockedUntil" = NOW() + (${leaseMs} * INTERVAL '1 millisecond')
    FROM candidates
    WHERE event."eventId" = candidates."eventId"
      AND event."status" = 'pending'
      AND (event."lockedUntil" IS NULL OR event."lockedUntil" < NOW())
    RETURNING event.*
  `;
  return rows;
}

async function finishEvent(event: ClaimedDomainEvent, result: { delivered: boolean; retryable: boolean; error?: string }): Promise<void> {
  const data = result.delivered || !result.retryable || event.attempts >= MAX_ATTEMPTS
    ? result.delivered
      ? { status: "completed" as const, completedAt: new Date(), leaseId: null, lockedAt: null, lockedUntil: null, lastError: null }
      : { status: "dead_letter" as const, leaseId: null, lockedAt: null, lockedUntil: null, lastError: result.error ?? "No adapter could deliver this event" }
    : {
        status: "pending" as const,
        lockedAt: null,
        lockedUntil: new Date(Date.now() + backoff(event.attempts)),
        leaseId: null,
        lastError: result.error ?? "Integration delivery failed",
      };

  await prisma.domainEventOutbox.updateMany({
    where: { eventId: event.eventId, leaseId: event.leaseId },
    data,
  });
}

export async function processClaimedDomainEvent(event: ClaimedDomainEvent, router: IntegrationRouter): Promise<void> {
  if (!isDomainEvent(event.payload)) {
    await finishEvent(event, { delivered: false, retryable: false, error: `Invalid domain event payload: ${event.type}` });
    return;
  }
  const results = await router.route(event.payload as DomainEvent);
  const failed = results.filter((result) => !result.delivered);
  if (failed.length === 0) {
    await finishEvent(event, { delivered: true, retryable: false });
    return;
  }
  await finishEvent(event, {
    delivered: false,
    retryable: failed.some((result) => result.retryable),
    error: failed.map((result) => result.error).filter(Boolean).join("; ") || "Integration delivery failed",
  });
}

export function createDomainEventWorker(router: IntegrationRouter, intervalMs = DEFAULT_INTERVAL_MS) {
  let stopped = false;
  let running = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  async function runOnce(): Promise<void> {
    if (stopped || running) return;
    running = true;
    try {
      await recoverExpiredLeases();
      const events = await claimDomainEvents();
      for (const event of events) {
        if (stopped) break;
        await processClaimedDomainEvent(event, router);
      }
    } catch {
      // The next poll retries database/network failures; background work must
      // never become an unhandled rejection in the API process.
    } finally {
      running = false;
    }
  }

  function start(): () => void {
    void runOnce();
    timer = setInterval(() => { void runOnce(); }, intervalMs);
    return stop;
  }

  function stop(): void {
    stopped = true;
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, runOnce };
}
