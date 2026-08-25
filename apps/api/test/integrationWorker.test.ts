import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, updateMany, update, create } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    integrationDelivery: { findUnique, updateMany, update, create },
    notification: { update },
  },
}));

import { processIntegrationDelivery } from "../src/lib/integrationWorker";

const delivery = {
  id: "delivery-1",
  orgId: "org-1",
  notificationId: "notification-1",
  provider: "slack",
  payloadJson: JSON.stringify({ text: "Job completed", channel: "field-updates", notificationId: "notification-1" }),
  status: "pending",
  attemptCount: 0,
  lockedUntil: null,
};

describe("durable integration worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue(delivery);
    updateMany.mockResolvedValue({ count: 1 });
    update.mockResolvedValue({});
    create.mockResolvedValue({ id: "delivery-1" });
  });

  it("claims an unlocked delivery with a lease and completes only its lease", async () => {
    const route = vi.fn().mockResolvedValue({ delivered: true, retryable: false });

    await processIntegrationDelivery(delivery.id, { route } as never);

    const claim = updateMany.mock.calls[0][0];
    expect(claim.where).toEqual(expect.objectContaining({
      id: delivery.id,
      OR: expect.arrayContaining([
        expect.objectContaining({ status: { in: ["pending", "failed"] } }),
      ]),
    }));
    expect(claim.data).toEqual(expect.objectContaining({
      status: "processing",
      attemptCount: { increment: 1 },
      leaseId: expect.any(String),
      lockedAt: expect.any(Date),
      lockedUntil: expect.any(Date),
    }));
    expect(route).toHaveBeenCalledWith("slack", expect.objectContaining({ text: "Job completed" }));

    const completion = updateMany.mock.calls[1][0];
    expect(completion.where).toEqual({ id: delivery.id, leaseId: claim.data.leaseId });
    expect(completion.data).toEqual(expect.objectContaining({ status: "delivered", leaseId: null }));
  });

  it("does not call a provider when another worker owns the lease", async () => {
    const route = vi.fn();
    updateMany.mockResolvedValueOnce({ count: 0 });

    await processIntegrationDelivery(delivery.id, { route } as never);

    expect(route).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it("keeps a transient provider failure retryable with a future attempt time", async () => {
    const route = vi.fn().mockResolvedValue({ delivered: false, retryable: true, error: "provider unavailable" });

    await processIntegrationDelivery(delivery.id, { route } as never);

    expect(updateMany.mock.calls[1][0]).toEqual(expect.objectContaining({
      where: expect.objectContaining({ id: delivery.id, leaseId: expect.any(String) }),
      data: expect.objectContaining({ status: "failed", nextAttemptAt: expect.any(Date), leaseId: null }),
    }));
  });

  it("dead-letters a terminal provider failure without retrying", async () => {
    const route = vi.fn().mockResolvedValue({ delivered: false, retryable: false, error: "invalid credentials" });

    await processIntegrationDelivery(delivery.id, { route } as never);

    expect(updateMany.mock.calls[1][0]).toEqual(expect.objectContaining({
      data: { status: "dead_letter", lastError: "invalid credentials", leaseId: null, lockedAt: null, lockedUntil: null },
    }));
  });
});
