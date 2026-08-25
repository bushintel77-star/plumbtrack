import { beforeEach, describe, expect, it, vi } from "vitest";

const { enqueueIntegrationDelivery } = vi.hoisted(() => ({ enqueueIntegrationDelivery: vi.fn() }));

vi.mock("../src/lib/integrationWorker", () => ({ enqueueIntegrationDelivery }));

import { SlackAdapter } from "../src/integrations/slack/SlackAdapter";

const completedEvent = {
  type: "job.completed" as const,
  eventId: "event-1",
  occurredAt: "2026-08-24T09:00:00.000Z",
  organizationId: "org-1",
  jobId: "J-1042",
  client: "Marlene Cho",
  address: "9 Booran Rd, Caulfield South VIC",
  scope: "Replaced leaking kitchen mixer cartridge",
  technicianId: "tim",
  durationSeconds: 4_680,
  photoCount: 3,
  customerSigned: true,
};

describe("SlackAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enqueueIntegrationDelivery.mockResolvedValue(true);
  });

  it("renders and queues a provider delivery from a job-completed event", async () => {
    const result = await new SlackAdapter().deliver(completedEvent);

    expect(result).toEqual({ delivered: true, retryable: false });
    expect(enqueueIntegrationDelivery).toHaveBeenCalledWith(expect.objectContaining({
      orgId: "org-1",
      provider: "slack",
      payload: expect.objectContaining({
        text: "Job completed · J-1042 · Marlene Cho",
        channel: "field-completions",
        blocks: expect.arrayContaining([
          expect.objectContaining({ type: "header" }),
          expect.objectContaining({ type: "section" }),
        ]),
      }),
    }));
  });
});
