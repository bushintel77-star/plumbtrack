import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const { jobFindFirst, jobUpdate } = vi.hoisted(() => ({
  jobFindFirst: vi.fn(),
  jobUpdate: vi.fn(),
}));
vi.mock("@plumbtrack/database", () => ({
  prisma: { job: { findFirst: jobFindFirst, update: jobUpdate } },
}));

import { buildApp } from "../src/server";
import { issueAuthToken, type OrganizationRole } from "../src/lib/auth";

const ORG = "org-note-test";
function bearer(role: OrganizationRole): string {
  return `Bearer ${issueAuthToken({ userId: "u-1", organizationId: ORG, role })}`;
}

describe("POST /api/jobs/:id/notes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });
  afterAll(async () => app.close());
  beforeEach(() => {
    vi.clearAllMocks();
    jobFindFirst.mockResolvedValue({ id: "job-1", orgId: ORG });
    jobUpdate.mockResolvedValue({ id: "job-1", fieldNote: "Arrived, water off" });
  });

  it("persists the field note and returns it", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/job-1/notes",
      headers: { authorization: bearer("technician") },
      payload: { note: "  Arrived, water off  " },
    });

    expect(response.statusCode).toBe(200);
    expect(jobUpdate).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: { fieldNote: "Arrived, water off" },
    });
    expect(response.json().fieldNote).toBe("Arrived, water off");
  });

  it("404s on a job outside the org", async () => {
    jobFindFirst.mockResolvedValue(null);
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/job-1/notes",
      headers: { authorization: bearer("technician") },
      payload: { note: "x" },
    });
    expect(response.statusCode).toBe(404);
    expect(jobUpdate).not.toHaveBeenCalled();
  });
});
