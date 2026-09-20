import { prisma } from "@plumbtrack/database";

/**
 * Retention sweeper (P1-7) — the janitor the revocable-sessions work never
 * had: expired/revoked Session rows, dead OAuth authorization rounds, stale
 * integration-delivery leases and abandoned media upload intents all piled
 * up forever. One interval worker, additive-only deletes, conservative
 * retention windows:
 *
 *  - Sessions: revoked or expired AND untouched for 7 days (the device list
 *    only shows live rows, but "last seen 3 days ago on this revoked device"
 *    is real history worth keeping a week).
 *  - OAuth authorizations: past their expiresAt, or consumed more than a day
 *    ago (single-use rows whose round trip is long over).
 *  - Integration deliveries: unlocked from crashed workers (lockedUntil in
 *    the past on non-terminal rows — redelivered by the normal retry path),
 *    and terminal rows older than 30 days dropped.
 *  - Media assets: upload intents that never completed and expired (the
 *    client got a 410 on complete; the row is dead weight).
 *
 * Failures log and never crash the process — a skipped sweep retries on the
 * next tick.
 */

const SESSION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const OAUTH_CONSUMED_RETENTION_MS = 24 * 60 * 60 * 1000;
const DELIVERY_TERMINAL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface SweepResult {
  sessionsDeleted: number;
  oauthAuthorizationsDeleted: number;
  deliveriesUnlocked: number;
  deliveriesDeleted: number;
  mediaIntentsDeleted: number;
}

export async function runSweep(now: Date = new Date()): Promise<SweepResult> {
  const sessionCutoff = new Date(now.getTime() - SESSION_RETENTION_MS);
  const oauthCutoff = new Date(now.getTime() - OAUTH_CONSUMED_RETENTION_MS);
  const deliveryCutoff = new Date(now.getTime() - DELIVERY_TERMINAL_RETENTION_MS);

  const sessionsDeleted = await prisma.session.deleteMany({
    where: {
      OR: [
        { revokedAt: { not: null }, lastSeenAt: { lt: sessionCutoff } },
        { expiresAt: { lte: now }, lastSeenAt: { lt: sessionCutoff } },
      ],
    },
  });

  const oauthAuthorizationsDeleted = await prisma.oAuthAuthorization.deleteMany({
    where: {
      OR: [
        { expiresAt: { lte: now } },
        { consumedAt: { not: null, lte: oauthCutoff } },
      ],
    },
  });

  // A crashed worker leaves a lease that expired — clear the lock columns so
  // the delivery worker's own recovery query picks the row up again.
  const deliveriesUnlocked = await prisma.integrationDelivery.updateMany({
    where: { lockedUntil: { lte: now }, status: { in: ["pending", "failed"] } },
    data: { leaseId: null, lockedAt: null, lockedUntil: null },
  });

  const deliveriesDeleted = await prisma.integrationDelivery.deleteMany({
    where: {
      status: { in: ["delivered", "dead_letter"] },
      OR: [
        { deliveredAt: { lt: deliveryCutoff } },
        { deliveredAt: null, nextAttemptAt: { lt: deliveryCutoff } },
      ],
    },
  });

  const mediaIntentsDeleted = await prisma.mediaAsset.deleteMany({
    where: { status: "pending", expiresAt: { lte: now } },
  });

  return {
    sessionsDeleted: sessionsDeleted.count,
    oauthAuthorizationsDeleted: oauthAuthorizationsDeleted.count,
    deliveriesUnlocked: deliveriesUnlocked.count,
    deliveriesDeleted: deliveriesDeleted.count,
    mediaIntentsDeleted: mediaIntentsDeleted.count,
  };
}

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;

export function createSweeperWorker(intervalMs = DEFAULT_INTERVAL_MS) {
  let stopped = false;
  let running = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  async function runOnce(): Promise<void> {
    if (stopped || running) return;
    running = true;
    try {
      const result = await runSweep();
      const total =
        result.sessionsDeleted +
        result.oauthAuthorizationsDeleted +
        result.deliveriesDeleted +
        result.mediaIntentsDeleted;
      if (total > 0) {
        console.log("[sweeper] pruned", result);
      }
    } catch (error) {
      console.error("[sweeper] sweep failed — retrying next tick", error);
    } finally {
      running = false;
    }
  }

  return {
    start(): void {
      if (timer) return;
      timer = setInterval(() => void runOnce(), intervalMs);
      timer.unref?.();
      void runOnce();
    },
    stop(): void {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
