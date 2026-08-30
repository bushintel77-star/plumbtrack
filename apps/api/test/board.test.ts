import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const { jobFindMany, quoteFindMany } = vi.hoisted(() => ({
  jobFindMany: vi.fn(),
  quoteFindMany: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    job: { findMany: jobFindMany },
    quote: { findMany: quoteFindMany },
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
  });

  it("returns jobs and quotes mapped to the board payload shape", async () => {
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
    });

    expect(body.quotes).toHaveLength(1);
    expect(body.quotes[0]).toEqual({
      id: "quote-1",
      client: "Alice",
      status: "draft",
      lines: [{ id: "line-1", description: "Replace pipe", quantity: 2, unitPrice: 50 }],
    });
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
