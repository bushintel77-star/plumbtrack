import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const prismaMock = vi.hoisted(() => {
  const mock = {
    job: { findFirst: vi.fn() },
    jobMessage: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), groupBy: vi.fn() },
    domainEventOutbox: { create: vi.fn() },
    slackWorkspace: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  mock.$transaction.mockImplementation(async (fn: (tx: typeof mock) => unknown) => fn(mock));
  return mock;
});
vi.mock("@plumbtrack/database", () => ({ prisma: prismaMock }));
vi.mock("../src/lib/liveBus", () => ({ publishToOrg: vi.fn() }));
import { publishToOrg } from "../src/lib/liveBus";

import { buildApp } from "../src/server";
import { issueAuthToken, type OrganizationRole } from "../src/lib/auth";

const ORG = "org-msg-test";
function bearer(role: OrganizationRole): string {
  return `Bearer ${issueAuthToken({ userId: "u-1", organizationId: ORG, role })}`;
}

const JOB = { id: "job-1", orgId: ORG, client: "Marlene Cho", address: "9 Booran Rd", scope: "Blocked drain" };

function stored(overrides: Record<string, unknown> = {}) {
  return {
    id: "m-1",
    orgId: ORG,
    jobId: "job-1",
    direction: "dispatch",
    sender: "Dana (office)",
    body: "Customer added a note — access via side gate.",
    source: "fieldloop",
    opId: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("job-scoped messages", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });
  afterAll(async () => app.close());
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.job.findFirst.mockResolvedValue(JOB);
    prismaMock.jobMessage.findMany.mockResolvedValue([]);
    prismaMock.jobMessage.findFirst.mockResolvedValue(null);
    prismaMock.slackWorkspace.findFirst.mockResolvedValue(null);
  });

  it("posts a dispatch message, persists it, and publishes a live frame", async () => {
    prismaMock.jobMessage.create.mockResolvedValue(stored());

    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/job-1/messages",
      headers: { authorization: bearer("dispatcher") },
      payload: { direction: "dispatch", sender: "Dana (office)", body: "Customer added a note — access via side gate." },
    });

    expect(response.statusCode).toBe(201);
    expect(prismaMock.jobMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ jobId: "job-1", orgId: ORG, direction: "dispatch", source: "fieldloop" }),
    });
    expect(publishToOrg).toHaveBeenCalledWith(
      expect.objectContaining({ topic: "topic/jobs/message", jobId: "job-1", message: expect.objectContaining({ source: "fieldloop" }) })
    );
    // Slack isn't connected: nothing is queued for the bridge.
    expect(prismaMock.domainEventOutbox.create).not.toHaveBeenCalled();
    expect(response.json().slack).toEqual({ connected: false, linked: false });
  });

  it("lists the thread in ascending order with provenance and the bridge state", async () => {
    prismaMock.jobMessage.findMany.mockResolvedValue([
      stored({ id: "m-1", body: "first" }),
      stored({ id: "m-2", direction: "field", sender: "tech", body: "second", source: "slack", createdAt: new Date("2026-09-01T00:01:00Z") }),
    ]);
    prismaMock.slackWorkspace.findFirst.mockResolvedValue({ id: "ws-1", channelRoutes: [{ channelId: "C0DISPATCH" }] });

    const response = await app.inject({
      method: "GET",
      url: "/api/jobs/job-1/messages",
      headers: { authorization: bearer("technician") },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.messages).toHaveLength(2);
    expect(body.messages[1]).toMatchObject({ id: "m-2", source: "slack" });
    expect(body.slack).toEqual({ connected: true, linked: true });
  });

  it("rejects a message on a job outside the org", async () => {
    prismaMock.job.findFirst.mockResolvedValue(null);
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/job-1/messages",
      headers: { authorization: bearer("dispatcher") },
      payload: { direction: "dispatch", sender: "x", body: "y" },
    });
    expect(response.statusCode).toBe(404);
    expect(prismaMock.jobMessage.create).not.toHaveBeenCalled();
  });

  it("forbids a field session from posting as dispatch", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/job-1/messages",
      headers: { authorization: bearer("technician") },
      payload: { direction: "dispatch", sender: "staff-1", body: "Pretending to be the office" },
    });
    expect(response.statusCode).toBe(403);
    expect(prismaMock.jobMessage.create).not.toHaveBeenCalled();
  });

  it("returns the stored message for a retried outbox post instead of writing it twice", async () => {
    prismaMock.jobMessage.findFirst.mockResolvedValue(stored({ id: "m-7", direction: "field", opId: "msg-job-1-abc" }));

    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/job-1/messages",
      headers: { authorization: bearer("technician") },
      payload: { direction: "field", sender: "staff-1", body: "Arrived", opId: "msg-job-1-abc" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().message).toMatchObject({ id: "m-7", opId: "msg-job-1-abc" });
    expect(prismaMock.jobMessage.findFirst).toHaveBeenCalledWith({ where: { opId: "msg-job-1-abc", orgId: ORG, jobId: "job-1" } });
    expect(prismaMock.jobMessage.create).not.toHaveBeenCalled();
    expect(publishToOrg).not.toHaveBeenCalled();
  });

  it("queues the Slack thread delivery in the same transaction when the bridge is linked", async () => {
    prismaMock.slackWorkspace.findFirst.mockResolvedValue({ id: "ws-1", channelRoutes: [{ channelId: "C0DISPATCH" }] });
    prismaMock.jobMessage.create.mockResolvedValue(stored({ id: "m-8", direction: "field", sender: "staff-1", body: "Need a 20mm valve", opId: "op-8" }));

    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/job-1/messages",
      headers: { authorization: bearer("technician") },
      payload: { direction: "field", sender: "staff-1", body: "Need a 20mm valve", opId: "op-8" },
    });

    expect(response.statusCode).toBe(201);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.domainEventOutbox.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: `job.message_posted:${ORG}:m-8`,
        organizationId: ORG,
        type: "job.message_posted",
        payload: expect.objectContaining({
          jobId: "job-1",
          messageId: "m-8",
          direction: "field",
          body: "Need a 20mm valve",
          client: "Marlene Cho",
          address: "9 Booran Rd",
        }),
      }),
    });
    expect(response.json().slack).toEqual({ connected: true, linked: true });
  });

  it("does not queue a Slack delivery when a workspace is connected but job messages aren't routed", async () => {
    prismaMock.slackWorkspace.findFirst.mockResolvedValue({ id: "ws-1", channelRoutes: [] });
    prismaMock.jobMessage.create.mockResolvedValue(stored());

    await app.inject({
      method: "POST",
      url: "/api/jobs/job-1/messages",
      headers: { authorization: bearer("dispatcher") },
      payload: { direction: "dispatch", sender: "Dana", body: "hello" },
    });

    expect(prismaMock.domainEventOutbox.create).not.toHaveBeenCalled();
  });
});

describe("GET /api/messages/threads (field Comms inbox)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });
  afterAll(async () => app.close());
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.slackWorkspace.findFirst.mockResolvedValue(null);
  });

  it("returns one row per job with its last message and when dispatch last wrote", async () => {
    prismaMock.jobMessage.groupBy
      .mockResolvedValueOnce([
        { jobId: "job-2", _count: { _all: 3 }, _max: { createdAt: new Date("2026-09-16T02:00:00Z") } },
        { jobId: "job-1", _count: { _all: 1 }, _max: { createdAt: new Date("2026-09-16T01:00:00Z") } },
      ])
      .mockResolvedValueOnce([{ jobId: "job-2", _max: { createdAt: new Date("2026-09-16T01:30:00Z") } }]);
    prismaMock.jobMessage.findMany.mockResolvedValue([
      stored({ id: "m-3", jobId: "job-2", direction: "field", body: "Done", createdAt: new Date("2026-09-16T02:00:00Z") }),
      stored({ id: "m-1", jobId: "job-1", direction: "field", body: "On site", createdAt: new Date("2026-09-16T01:00:00Z") }),
    ]);

    const response = await app.inject({
      method: "GET",
      url: "/api/messages/threads",
      headers: { authorization: bearer("technician") },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.threads).toEqual([
      expect.objectContaining({ jobId: "job-2", count: 3, lastDispatchAt: "2026-09-16T01:30:00.000Z", lastMessage: expect.objectContaining({ id: "m-3" }) }),
      expect.objectContaining({ jobId: "job-1", count: 1, lastDispatchAt: null, lastMessage: expect.objectContaining({ id: "m-1" }) }),
    ]);
    expect(body.slack).toEqual({ connected: false, linked: false });
    expect(prismaMock.jobMessage.groupBy).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { orgId: ORG } }));
  });

  it("returns an empty inbox without querying messages twice", async () => {
    prismaMock.jobMessage.groupBy.mockResolvedValueOnce([]);

    const response = await app.inject({
      method: "GET",
      url: "/api/messages/threads",
      headers: { authorization: bearer("technician") },
    });

    expect(response.json().threads).toEqual([]);
    expect(prismaMock.jobMessage.findMany).not.toHaveBeenCalled();
  });
});
