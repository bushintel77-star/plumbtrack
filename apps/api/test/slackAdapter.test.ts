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

  it("queues a job message as a reply in the job's Slack thread, escaping Slack control characters", async () => {
    const adapter = new SlackAdapter();
    expect(adapter.supports("job.message_posted")).toBe(true);

    const result = await adapter.deliver({
      type: "job.message_posted",
      eventId: "job.message_posted:org-1:m-1",
      occurredAt: "2026-09-16T01:00:00.000Z",
      organizationId: "org-1",
      jobId: "J-1043",
      messageId: "m-1",
      direction: "field",
      sender: "Dave",
      body: "Valve <20mm> & fittings needed",
      client: "Marlene Cho",
      address: "9 Booran Rd, Caulfield South VIC",
      scope: "Replace tempering valve",
    });

    expect(result).toEqual({ delivered: true, retryable: false });
    expect(enqueueIntegrationDelivery).toHaveBeenCalledWith({
      orgId: "org-1",
      provider: "slack",
      payload: expect.objectContaining({
        text: "*Dave* · field\nValve &lt;20mm&gt; &amp; fittings needed",
        orgId: "org-1",
        eventType: "job.message_posted",
        jobThread: expect.objectContaining({
          jobId: "J-1043",
          headerText: "Job J-1043 · Marlene Cho — 9 Booran Rd, Caulfield South VIC",
          headerBlocks: expect.arrayContaining([expect.objectContaining({ type: "header" })]),
        }),
      }),
    });
  });
});
