import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw, updateMany } = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    $queryRaw: queryRaw,
    domainEventOutbox: { updateMany },
  },
}));

import { DefaultIntegrationRouter } from "../src/integrations/IntegrationRouter";
import { claimDomainEvents, processClaimedDomainEvent } from "../src/lib/domainEventWorker";

const event = {
  type: "job.completed" as const,
  eventId: "job.completed:org-1:J-1",
  occurredAt: "2026-08-24T09:00:00.000Z",
  organizationId: "org-1",
  jobId: "J-1",
  client: "Marlene Cho",
  address: "9 Booran Rd",
  scope: "Mixer repair",
  durationSeconds: 3600,
  photoCount: 2,
  customerSigned: true,
};

describe("durable domain-event worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryRaw.mockResolvedValue([]);
    updateMany.mockResolvedValue({ count: 1 });
  });

  it("claims events with an atomic pending-and-expired lease condition", async () => {
    queryRaw.mockResolvedValue([{ eventId: event.eventId, organizationId: "org-1", type: event.type, payload: event, attempts: 1, leaseId: "lease-1" }]);

    const rows = await claimDomainEvents(10, 60_000);
    expect(rows).toHaveLength(1);
    const sql = queryRaw.mock.calls[0][0].join("");
    expect(sql).toContain('"status" = \'pending\'');
    expect(sql).toContain('("lockedUntil" IS NULL OR "lockedUntil" < NOW())');
    expect(sql).toContain('RETURNING event.*');
  });

  it("routes a claimed event through registered adapters and completes only its lease", async () => {
    const adapter = {
      provider: "slack",
      supports: vi.fn(() => true),
      deliver: vi.fn().mockResolvedValue({ delivered: true, retryable: false }),
    };
    const router = new DefaultIntegrationRouter();
    router.register(adapter);

    await processClaimedDomainEvent({
      eventId: event.eventId,
      organizationId: event.organizationId,
      type: event.type,
      payload: event,
      attempts: 1,
      leaseId: "lease-1",
    }, router);

    expect(adapter.deliver).toHaveBeenCalledWith(event);
    expect(updateMany).toHaveBeenCalledWith({
      where: { eventId: event.eventId, leaseId: "lease-1" },
      data: expect.objectContaining({ status: "completed" }),
    });
  });

  it("returns a transient adapter failure to pending with a retry time", async () => {
    const router = new DefaultIntegrationRouter();
    router.register({
      provider: "slack",
      supports: () => true,
      deliver: async () => ({ delivered: false, retryable: true, error: "temporarily unavailable" }),
    });

    await processClaimedDomainEvent({
      eventId: event.eventId,
      organizationId: event.organizationId,
      type: event.type,
      payload: event,
      attempts: 1,
      leaseId: "lease-1",
    }, router);

    expect(updateMany).toHaveBeenCalledWith({
      where: { eventId: event.eventId, leaseId: "lease-1" },
      data: expect.objectContaining({ status: "pending", lockedUntil: expect.any(Date), lastError: "temporarily unavailable" }),
    });
  });
});
