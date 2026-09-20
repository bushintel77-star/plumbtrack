import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * P1-4 — the urgency signal end-to-end: PATCH /api/jobs/:id {urgent} is a
 * manager+ write (never a field write), a false→true transition emits the
 * job.status_urgent domain event exactly once, no event fires for no-ops or
 * un-marking, the attention pane raises a red flag for open urgent jobs, and
 * the Slack adapter now claims the event it previously said was "stored".
 */

const { jobFindFirst, jobFindUnique, jobUpdateMany, outboxCreate, auditCreate } = vi.hoisted(() => ({
  jobFindFirst: vi.fn(),
  jobFindUnique: vi.fn(),
  jobUpdateMany: vi.fn(),
  outboxCreate: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    job: { findFirst: jobFindFirst, findUnique: jobFindUnique, updateMany: jobUpdateMany },
    domainEventOutbox: { create: outboxCreate },
    auditEvent: { create: auditCreate },
    $transaction: async (fn: (tx: unknown) => unknown) => {
      const tx = {
        job: { findFirst: jobFindFirst, findUnique: jobFindUnique, updateMany: jobUpdateMany },
        domainEventOutbox: { create: outboxCreate },
      };
      return fn(tx);
    },
  },
}));

import { buildApp } from "../src/server";
import { issueAuthToken } from "../src/lib/auth";
import { computeNeedsAttention, type AttentionInputJob } from "../src/lib/needsAttention";
import { SlackAdapter } from "../src/integrations/slack/SlackAdapter";

const ORG = "org-urgent-test";
const bearer = (role: string) =>
  `Bearer ${issueAuthToken({ userId: "user-1", organizationId: ORG, role: role as never })}`;

const JOB = {
  id: "job-1",
  orgId: ORG,
  status: "scheduled",
  urgent: false,
  client: "Urgent Client",
  address: "9 Test St",
  scope: "Burst pipe",
  timeEntries: [],
  photos: [],
  quote: null,
};

describe("PATCH /api/jobs/:id {urgent} — the urgency write", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    vi.clearAllMocks();
    jobFindFirst.mockResolvedValue(JOB);
    jobUpdateMany.mockResolvedValue({ count: 1 });
    jobFindUnique.mockResolvedValue(JOB);
    outboxCreate.mockResolvedValue({});
    auditCreate.mockResolvedValue({});
  });

  it("emits job.status_urgent exactly once on the false→true transition", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/jobs/job-1",
      headers: { authorization: bearer("manager") },
      payload: { urgent: true },
    });
    expect(res.statusCode).toBe(200);
    expect(outboxCreate).toHaveBeenCalledTimes(1);
    const args = outboxCreate.mock.calls[0][0] as { data: { type: string; payload: Record<string, unknown> } };
    expect(args.data.type).toBe("job.status_urgent");
    expect(args.data.payload).toMatchObject({ jobId: "job-1", organizationId: ORG, markedBy: "user-1" });
  });

  it("does not emit for un-marking (urgent: false)", async () => {
    jobFindFirst.mockResolvedValue({ ...JOB, urgent: true });
    const res = await app.inject({
      method: "PATCH",
      url: "/api/jobs/job-1",
      headers: { authorization: bearer("owner") },
      payload: { urgent: false },
    });
    expect(res.statusCode).toBe(200);
    expect(outboxCreate).not.toHaveBeenCalled();
  });

  it("403s a technician — urgency is a dispatch decision, never a field write", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/jobs/job-1",
      headers: { authorization: bearer("technician") },
      payload: { urgent: true },
    });
    expect(res.statusCode).toBe(403);
    expect(outboxCreate).not.toHaveBeenCalled();
  });
});

describe("computeNeedsAttention — the urgent rule", () => {
  const base: AttentionInputJob = {
    id: "job-1",
    client: "Urgent Client",
    address: "9 Test St",
    scope: "Burst pipe",
    status: "scheduled",
    appointment: null,
    timeEntries: [],
  };

  it("raises a red flag for an open urgent job", () => {
    const flags = computeNeedsAttention([{ ...base, urgent: true }], new Date("2026-09-21T03:00:00Z"));
    const flag = flags.find(item => item.reason === "urgent");
    expect(flag).toMatchObject({ severity: "red", jobIds: ["job-1"], id: "urgent:job-1" });
  });

  it("raises nothing once the job completes or the flag clears", () => {
    expect(computeNeedsAttention([{ ...base, urgent: true, status: "completed" }]).some(f => f.reason === "urgent")).toBe(false);
    expect(computeNeedsAttention([base]).some(f => f.reason === "urgent")).toBe(false);
  });
});

describe("SlackAdapter — job.status_urgent is now claimed", () => {
  it("supports the event it previously stored ahead of the signal", () => {
    expect(new SlackAdapter().supports("job.status_urgent")).toBe(true);
  });
});
