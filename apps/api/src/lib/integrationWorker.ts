import { randomUUID } from "node:crypto";
import { prisma } from "@plumbtrack/database";
import type { ProviderDeliveryRouter } from "../integrations/DeliveryRouter";

const DEFAULT_INTERVAL_MS = 10_000;
const MAX_ATTEMPTS = 8;
const MAX_BACKOFF_MS = 15 * 60_000;
const LEASE_MS = 60_000;
const CLAIM_SIZE = 25;

export interface DeliveryPayload {
  text: string;
  channel?: string;
  notificationId?: string;
  blocks?: unknown[];
}

export interface ProviderDeliveryResult {
  delivered: boolean;
  retryable: boolean;
  error?: string;
  httpStatus?: number;
  providerMessageId?: string;
}

interface IntegrationDeliveryRecord {
  id: string;
  provider: string;
  payloadJson: string;
  providerMessageId?: string | null;
  attemptCount: number;
  status: string;
  notificationId?: string | null;
}

let activeRouter: ProviderDeliveryRouter | null = null;

export function setIntegrationDeliveryRouter(router: ProviderDeliveryRouter): void {
  activeRouter = router;
}

function backoff(attemptCount: number): number {
  return Math.min(MAX_BACKOFF_MS, 2_000 * (2 ** Math.max(0, attemptCount - 1)));
}

function parsePayload(value: string): DeliveryPayload | null {
  try {
    const parsed = JSON.parse(value) as Partial<DeliveryPayload>;
    if (typeof parsed.text !== "string" || !parsed.text.trim()) return null;
    return {
      text: parsed.text,
      channel: typeof parsed.channel === "string" ? parsed.channel : undefined,
      notificationId: typeof parsed.notificationId === "string" ? parsed.notificationId : undefined,
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : undefined,
    };
  } catch {
    return null;
  }
}

async function updateNotification(notificationId: string | undefined, delivered: boolean, error?: string): Promise<void> {
  if (!notificationId) return;
  await prisma.notification.update({
    where: { id: notificationId },
    data: delivered ? { slackDelivered: true, slackError: null } : { slackError: error ?? "Integration delivery failed" },
  });
}

async function claimDelivery(deliveryId: string, leaseMs = LEASE_MS): Promise<IntegrationDeliveryRecord | null> {
  const now = new Date();
  const leaseId = randomUUID();
  const claimed = await prisma.integrationDelivery.updateMany({
    where: {
      id: deliveryId,
      OR: [
        {
          status: { in: ["pending", "failed"] },
          nextAttemptAt: { lte: now },
          OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
        },
        { status: "processing", lockedUntil: { lt: now } },
      ],
    },
    data: {
      status: "processing",
      attemptCount: { increment: 1 },
      leaseId,
      lockedAt: now,
      lockedUntil: new Date(now.getTime() + leaseMs),
    },
  });
  if (claimed.count === 0) return null;

  const row = await prisma.integrationDelivery.findUnique({ where: { id: deliveryId } });
  if (!row) return null;
  return { ...row, leaseId } as IntegrationDeliveryRecord & { leaseId: string };
}

async function recordAttempt(
  delivery: IntegrationDeliveryRecord & { leaseId: string },
  result: ProviderDeliveryResult,
  startedAt: Date,
): Promise<void> {
  if (!prisma.integrationDeliveryAttempt) return;
  await prisma.integrationDeliveryAttempt.create({
    data: {
      deliveryId: delivery.id,
      attemptNumber: delivery.attemptCount,
      status: result.delivered ? "delivered" : result.retryable ? "failed" : "dead_letter",
      httpStatus: result.httpStatus,
      providerMessageId: result.providerMessageId,
      error: result.error,
      startedAt,
      finishedAt: new Date(),
    },
  });
}

async function finishDelivery(
  delivery: IntegrationDeliveryRecord & { leaseId: string },
  result: ProviderDeliveryResult,
  startedAt: Date,
): Promise<void> {
  const terminal = !result.delivered && (!result.retryable || delivery.attemptCount >= MAX_ATTEMPTS);
  const data = result.delivered
    ? { status: "delivered" as const, deliveredAt: new Date(), lastError: null, providerMessageId: result.providerMessageId, leaseId: null, lockedAt: null, lockedUntil: null }
    : terminal
      ? { status: "dead_letter" as const, lastError: result.error ?? "Integration delivery failed", leaseId: null, lockedAt: null, lockedUntil: null }
      : { status: "failed" as const, nextAttemptAt: new Date(Date.now() + backoff(delivery.attemptCount)), lastError: result.error ?? "Integration delivery failed", leaseId: null, lockedAt: null, lockedUntil: null };

  // A stale worker can finish after its lease has been reclaimed. The lease
  // predicate makes that late result a no-op instead of corrupting new state.
  const finished = await prisma.integrationDelivery.updateMany({
    where: { id: delivery.id, leaseId: delivery.leaseId },
    data,
  });
  if (finished.count > 0) {
    await recordAttempt(delivery, result, startedAt);
    await updateNotification(delivery.notificationId ?? undefined, result.delivered, result.error);
  }
}

export async function processIntegrationDelivery(
  deliveryId: string,
  router: ProviderDeliveryRouter | null = activeRouter,
): Promise<void> {
  const existing = await prisma.integrationDelivery.findUnique({ where: { id: deliveryId } });
  if (!existing || existing.status === "delivered" || existing.status === "dead_letter") return;

  const delivery = await claimDelivery(deliveryId);
  if (!delivery) return;

  const startedAt = new Date();
  const payload = parsePayload(delivery.payloadJson);
  if (!payload) {
    await finishDelivery(delivery as IntegrationDeliveryRecord & { leaseId: string }, {
      delivered: false,
      retryable: false,
      error: "Invalid integration payload",
    }, startedAt);
    return;
  }
  if (!router) {
    await finishDelivery(delivery as IntegrationDeliveryRecord & { leaseId: string }, {
      delivered: false,
      retryable: true,
      error: "Integration delivery router unavailable",
    }, startedAt);
    return;
  }

  let result: ProviderDeliveryResult;
  try {
    result = await router.route(delivery.provider, payload);
  } catch (error) {
    result = {
      delivered: false,
      retryable: true,
      error: error instanceof Error ? error.message : "Integration delivery failed",
    };
  }
  await finishDelivery(delivery as IntegrationDeliveryRecord & { leaseId: string }, result, startedAt);
}

export async function enqueueIntegrationDelivery(input: {
  orgId: string;
  provider: string;
  payload: DeliveryPayload;
  notificationId?: string;
}): Promise<boolean> {
  if (!prisma.integrationDelivery) return false;
  const delivery = await prisma.integrationDelivery.create({
    data: {
      orgId: input.orgId,
      notificationId: input.notificationId,
      provider: input.provider,
      payloadJson: JSON.stringify(input.payload),
    },
  });
  void processIntegrationDelivery(delivery.id).catch(() => undefined);
  return true;
}

export async function enqueueSlackDelivery(input: {
  orgId: string;
  notificationId: string;
  text: string;
  channel?: string;
}): Promise<boolean> {
  return enqueueIntegrationDelivery({
    orgId: input.orgId,
    provider: "slack",
    notificationId: input.notificationId,
    payload: { text: input.text, channel: input.channel, notificationId: input.notificationId },
  });
}

export function createIntegrationWorker(router: ProviderDeliveryRouter, intervalMs = DEFAULT_INTERVAL_MS) {
  let stopped = false;
  let running = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  setIntegrationDeliveryRouter(router);

  async function runOnce(): Promise<void> {
    if (stopped || running) return;
    running = true;
    try {
      const now = new Date();
      const deliveries = await prisma.integrationDelivery.findMany({
        where: {
          OR: [
            { status: "pending", nextAttemptAt: { lte: now }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
            { status: "failed", nextAttemptAt: { lte: now }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
            { status: "processing", lockedUntil: { lt: now } },
          ],
        },
        orderBy: { createdAt: "asc" },
        take: CLAIM_SIZE,
      });
      for (const delivery of deliveries) {
        if (stopped) break;
        await processIntegrationDelivery(delivery.id, router);
      }
    } catch {
      // Recover on the next interval; background delivery must not crash the API.
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
