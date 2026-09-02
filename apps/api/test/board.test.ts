import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const { jobFindMany, quoteFindMany, userFindMany } = vi.hoisted(() => ({
  jobFindMany: vi.fn(),
  quoteFindMany: vi.fn(),
  userFindMany: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    job: { findMany: jobFindMany },
    quote: { findMany: quoteFindMany },
    user: { findMany: userFindMany },
  },
}));

import { buildApp } from "../src/server";

const ORG = "org_board_test";

describe("GET /api/board", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    userFindMany.mockResolvedValue([]);
  });

  it("returns jobs, quotes, and the job's schedulable appointment with the staff name", async () => {
    jobFindMany.mockResolvedValue([
      {
        id: "job-1",
        orgId: ORG,
        client: "Alice",
        address: "1 Main St",
        scope: "Fix leak",
        status: "scheduled",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        timeEntries: [
          { id: "te-1", jobId: "job-1", staffId: "sarah", start: new Date("2026-01-01T08:00:00.000Z"), end: null },
        ],
        photos: [],
        appointments: [
          {
            id: "ap-1",
            orgId: ORG,
            jobId: "job-1",
            assignedStaffId: "t-dana",
            scheduledStart: new Date("2026-01-02T09:00:00.000Z"),
            scheduledEnd: new Date("2026-01-02T10:30:00.000Z"),
            status: "assigned",
          },
        ],
      },
    ]);
    quoteFindMany.mockResolvedValue([
      {
        id: "quote-1",
        orgId: ORG,
        client: "Alice",
        status: "draft",
        lines: [{ id: "line-1", desc: "Replace pipe", qty: 2, rate: 50, sortOrder: 0 }],
      },
    ]);
    userFindMany.mockResolvedValue([{ id: "t-dana", name: "Dana Whitfield" }]);

    const response = await app.inject({
      method: "GET",
      url: "/api/board",
      headers: { "x-organization-id": ORG },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0]).toEqual({
      id: "job-1",
      client: "Alice",
      address: "1 Main St",
      scope: "Fix leak",
      status: "scheduled",
      createdAt: "2026-01-01T00:00:00.000Z",
      timeEntries: [{ id: "te-1", staffId: "sarah", start: "2026-01-01T08:00:00.000Z", end: null }],
      photos: [],
      appointment: {
        id: "ap-1",
        assignedStaffId: "t-dana",
        assignedStaffName: "Dana Whitfield",
        scheduledStart: "2026-01-02T09:00:00.000Z",
        scheduledEnd: "2026-01-02T10:30:00.000Z",
        status: "assigned",
      },
    });

    expect(body.quotes).toHaveLength(1);
    expect(body.quotes[0]).toEqual({
      id: "quote-1",
      client: "Alice",
      status: "draft",
      lines: [{ id: "line-1", description: "Replace pipe", quantity: 2, unitPrice: 50 }],
    });
  });

  it("returns appointment: null for jobs without a schedulable appointment", async () => {
    jobFindMany.mockResolvedValue([
      {
        id: "job-2",
        orgId: ORG,
        client: "Bob",
        address: "2 Side St",
        scope: "Fix drain",
        status: "scheduled",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        timeEntries: [],
        photos: [],
        appointments: [],
      },
    ]);
    quoteFindMany.mockResolvedValue([]);

    const response = await app.inject({
      method: "GET",
      url: "/api/board",
      headers: { "x-organization-id": ORG },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.jobs[0].appointment).toBeNull();
  });

  it("scopes queries to the requesting org", async () => {
    jobFindMany.mockResolvedValue([]);
    quoteFindMany.mockResolvedValue([]);

    await app.inject({
      method: "GET",
      url: "/api/board",
      headers: { "x-organization-id": ORG },
    });

    expect(jobFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId: ORG } }));
    expect(quoteFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId: ORG } }));
  });

  it("returns 400 when the org header is missing (legacy fallback)", async () => {
    const response = await app.inject({ method: "GET", url: "/api/board" });
    expect(response.statusCode).toBe(400);
  });

  it("returns empty arrays when the org has no jobs or quotes", async () => {
    jobFindMany.mockResolvedValue([]);
    quoteFindMany.mockResolvedValue([]);

    const response = await app.inject({
      method: "GET",
      url: "/api/board",
      headers: { "x-organization-id": ORG },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.jobs).toEqual([]);
    expect(body.quotes).toEqual([]);
  });
});
