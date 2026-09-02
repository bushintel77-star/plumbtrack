import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const { jobFindFirst, msgFindMany, msgCreate } = vi.hoisted(() => ({
  jobFindFirst: vi.fn(),
  msgFindMany: vi.fn(),
  msgCreate: vi.fn(),
}));
vi.mock("@plumbtrack/database", () => ({
  prisma: {
    job: { findFirst: jobFindFirst },
    jobMessage: { findMany: msgFindMany, create: msgCreate },
  },
}));
vi.mock("../src/lib/liveBus", () => ({ publishToOrg: vi.fn() }));
import { publishToOrg } from "../src/lib/liveBus";

import { buildApp } from "../src/server";
import { issueAuthToken, type OrganizationRole } from "../src/lib/auth";

const ORG = "org-msg-test";
function bearer(role: OrganizationRole): string {
  return `Bearer ${issueAuthToken({ userId: "u-1", organizationId: ORG, role })}`;
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
    jobFindFirst.mockResolvedValue({ id: "job-1", orgId: ORG });
    msgFindMany.mockResolvedValue([]);
  });

  it("posts a dispatch message, persists it, and publishes a live frame", async () => {
    msgCreate.mockResolvedValue({
      id: "m-1",
      orgId: ORG,
      jobId: "job-1",
      direction: "dispatch",
      sender: "Dana (office)",
      body: "Customer added a note — access via side gate.",
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/job-1/messages",
      headers: { authorization: bearer("dispatcher") },
      payload: { direction: "dispatch", sender: "Dana (office)", body: "Customer added a note — access via side gate." },
    });

    expect(response.statusCode).toBe(201);
    expect(msgCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ jobId: "job-1", orgId: ORG, direction: "dispatch" }),
    });
    expect(publishToOrg).toHaveBeenCalledWith(
      expect.objectContaining({ topic: "topic/jobs/message", jobId: "job-1" })
    );
  });

  it("lists the thread in ascending order", async () => {
    msgFindMany.mockResolvedValue([
      { id: "m-1", direction: "dispatch", sender: "office", body: "first", createdAt: new Date("2026-09-01T00:00:00Z") },
      { id: "m-2", direction: "field", sender: "tech", body: "second", createdAt: new Date("2026-09-01T00:01:00Z") },
    ]);
    const response = await app.inject({
      method: "GET",
      url: "/api/jobs/job-1/messages",
      headers: { authorization: bearer("technician") },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().messages).toHaveLength(2);
  });

  it("rejects a message on a job outside the org", async () => {
    jobFindFirst.mockResolvedValue(null);
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/job-1/messages",
      headers: { authorization: bearer("dispatcher") },
      payload: { direction: "dispatch", sender: "x", body: "y" },
    });
    expect(response.statusCode).toBe(404);
    expect(msgCreate).not.toHaveBeenCalled();
  });
});
