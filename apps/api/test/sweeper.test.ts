import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P1-7 — the retention sweeper. Pins the delete windows (what goes, what
 * survives) by capturing the prisma calls: a revoked session younger than
 * the retention window must SURVIVE, an expired intent must go, a crashed
 * worker's expired delivery lease must be released, and terminal deliveries
 * inside retention must stay.
 */

const captured: Record<string, unknown> = {};

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    session: {
      deleteMany: vi.fn(async ({ where }: { where: unknown }) => {
        captured.sessionWhere = where;
        return { count: 0 };
      }),
    },
    oAuthAuthorization: {
      deleteMany: vi.fn(async ({ where }: { where: unknown }) => {
        captured.oauthWhere = where;
        return { count: 0 };
      }),
    },
    integrationDelivery: {
      updateMany: vi.fn(async ({ where, data }: { where: unknown; data: unknown }) => {
        captured.deliveryUnlock = { where, data };
        return { count: 0 };
      }),
      deleteMany: vi.fn(async ({ where }: { where: unknown }) => {
        captured.deliveryDeleteWhere = where;
        return { count: 0 };
      }),
    },
    mediaAsset: {
      deleteMany: vi.fn(async ({ where }: { where: unknown }) => {
        captured.mediaWhere = where;
        return { count: 0 };
      }),
    },
  },
}));

import { runSweep } from "../src/lib/sweeper";

const NOW = new Date("2026-09-21T12:00:00Z");

describe("runSweep — retention windows", () => {
  beforeEach(() => {
    for (const key of Object.keys(captured)) delete captured[key];
  });

  it("keeps recently-revoked sessions, prunes only stale revoked/expired ones", async () => {
    await runSweep(NOW);
    const where = captured.sessionWhere as { OR: Array<Record<string, unknown>> };
    // Revoked branch carries the 7-day lastSeen retention…
    expect(where.OR[0]).toMatchObject({ revokedAt: { not: null }, lastSeenAt: { lt: new Date("2026-09-14T12:00:00Z") } });
    // …and the expired branch keeps the same protection.
    expect(where.OR[1]).toMatchObject({ expiresAt: { lte: NOW }, lastSeenAt: { lt: new Date("2026-09-14T12:00:00Z") } });
  });

  it("prunes OAuth rounds past expiry and consumed rounds a day old", async () => {
    await runSweep(NOW);
    const where = captured.oauthWhere as { OR: Array<Record<string, unknown>> };
    expect(where.OR[0]).toMatchObject({ expiresAt: { lte: NOW } });
    expect(where.OR[1]).toMatchObject({ consumedAt: { not: null, lte: new Date("2026-09-20T12:00:00Z") } });
  });

  it("releases expired delivery leases without deleting the row", async () => {
    await runSweep(NOW);
    const unlock = captured.deliveryUnlock as { where: Record<string, unknown>; data: Record<string, unknown> };
    expect(unlock.where).toMatchObject({ lockedUntil: { lte: NOW }, status: { in: ["pending", "failed"] } });
    expect(unlock.data).toEqual({ leaseId: null, lockedAt: null, lockedUntil: null });
  });

  it("drops only terminal deliveries past 30 days", async () => {
    await runSweep(NOW);
    const where = captured.deliveryDeleteWhere as { status: { in: string[] }; OR: Array<Record<string, unknown>> };
    expect(where.status.in).toEqual(["delivered", "dead_letter"]);
    expect(where.OR[0]).toMatchObject({ deliveredAt: { lt: new Date("2026-08-22T12:00:00Z") } });
  });

  it("deletes only media intents that never completed and expired", async () => {
    await runSweep(NOW);
    expect(captured.mediaWhere).toMatchObject({ status: "pending", expiresAt: { lte: NOW } });
  });

  it("returns per-target counts", async () => {
    const result = await runSweep(NOW);
    expect(result).toEqual({
      sessionsDeleted: 0,
      oauthAuthorizationsDeleted: 0,
      deliveriesUnlocked: 0,
      deliveriesDeleted: 0,
      mediaIntentsDeleted: 0,
    });
  });
});
