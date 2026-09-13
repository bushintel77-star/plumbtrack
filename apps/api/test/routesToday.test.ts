import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * GET /api/routes/today — the field app's daily route. Two contract points:
 *  1. The geometry/distances come from real geocoded job coordinates
 *     (haversine), not the placeholder payload it used to return.
 *  2. A read endpoint must not grow a table per call — a RouteVersion row is
 *     only written when the stop set actually changed.
 */

const {
  jobFindMany,
  routeVersionFindFirst,
  routeVersionCreate,
  auditCreate,
  routeAuditCreate,
} = vi.hoisted(() => ({
  jobFindMany: vi.fn(),
  routeVersionFindFirst: vi.fn(),
  routeVersionCreate: vi.fn(),
  auditCreate: vi.fn(),
  routeAuditCreate: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    job: { findMany: jobFindMany },
    routeVersion: { findFirst: routeVersionFindFirst, create: routeVersionCreate },
    routeRecalculationAudit: { create: routeAuditCreate },
    auditEvent: { create: auditCreate },
  },
}));

import { buildApp } from "../src/server";
import { issueAuthToken, type OrganizationRole } from "../src/lib/auth";

const ORG = "org-routes-test";

function bearer(role: OrganizationRole): string {
  return `Bearer ${issueAuthToken({ userId: "user-1", organizationId: ORG, role })}`;
}

const JOBS = [
  {
    id: "j-a", orgId: ORG, status: "scheduled", lat: -37.82, lng: 144.98,
    appointments: [{ scheduledStart: new Date("2026-09-14T08:00:00.000Z") }],
  },
  {
    id: "j-b", orgId: ORG, status: "scheduled", lat: -37.9, lng: 145.05,
    appointments: [{ scheduledStart: new Date("2026-09-14T10:00:00.000Z") }],
  },
  {
    id: "j-c", orgId: ORG, status: "scheduled", lat: null, lng: null,
    appointments: [],
  },
];

describe("GET /api/routes/today", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    vi.clearAllMocks();
    jobFindMany.mockResolvedValue(JOBS);
    auditCreate.mockResolvedValue({});
    routeAuditCreate.mockResolvedValue({});
  });

  it("returns real geometry and haversine distances between mapped stops", async () => {
    routeVersionFindFirst.mockResolvedValue(null);
    routeVersionCreate.mockResolvedValue({ id: "rv-1", version: 1, generatedAt: new Date("2026-09-14T00:00:00.000Z") });

    const response = await app.inject({ method: "GET", url: "/api/routes/today", headers: { authorization: bearer("technician") } });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.mappedStops).toBe(2);
    expect(body.unmappedStops).toBe(1);
    expect(body.geometry.coordinates).toEqual([[144.98, -37.82], [145.05, -37.9]]);
    // j-a → j-b ≈ 10.6km straight-line; the unmapped stop gets a null leg.
    const dist = body.stops[1].distanceFromPreviousKm;
    expect(dist).toBeGreaterThan(5);
    expect(dist).toBeLessThan(20);
    expect(body.stops[2].jobId).toBe("j-c");
    expect(body.totalDistanceKm).toBeCloseTo(dist, 2);
    // First-ever snapshot: a version row is written.
    expect(routeVersionCreate).toHaveBeenCalledTimes(1);
  });

  it("does not write a new RouteVersion when the stop set is unchanged", async () => {
    // Capture the exact stop set the first call persists, then replay it as
    // "the latest version" — the second identical poll must be a pure read.
    routeVersionFindFirst.mockResolvedValueOnce(null);
    let persistedStops: unknown;
    routeVersionCreate.mockImplementationOnce(async (args: { data: { stops: unknown } }) => {
      persistedStops = args.data.stops;
      return { id: "rv-7", version: 7, generatedAt: new Date("2026-09-14T00:00:00.000Z") };
    });
    await app.inject({ method: "GET", url: "/api/routes/today", headers: { authorization: bearer("technician") } });
    expect(routeVersionCreate).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    routeVersionFindFirst.mockResolvedValue({ id: "rv-7", version: 7, generatedAt: new Date("2026-09-14T00:00:00.000Z"), stops: persistedStops });

    const response = await app.inject({ method: "GET", url: "/api/routes/today", headers: { authorization: bearer("technician") } });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.routeId).toBe("rv-7");
    expect(body.version).toBe(7);
    expect(routeVersionCreate).not.toHaveBeenCalled();
    expect(routeAuditCreate).not.toHaveBeenCalled();
  });

  it("writes a new version when a stop appears", async () => {
    const staleStops = [
      { jobId: "j-a", sequence: 1, distanceFromPreviousKm: null, scheduledStart: "2026-09-14T08:00:00.000Z" },
    ];
    routeVersionFindFirst.mockResolvedValue({ id: "rv-7", version: 7, generatedAt: new Date("2026-09-13T00:00:00.000Z"), stops: staleStops });
    routeVersionCreate.mockResolvedValue({ id: "rv-8", version: 8, generatedAt: new Date("2026-09-14T00:00:00.000Z") });

    const response = await app.inject({ method: "GET", url: "/api/routes/today", headers: { authorization: bearer("technician") } });

    expect(response.statusCode).toBe(200);
    expect(response.json().version).toBe(8);
    expect(routeVersionCreate).toHaveBeenCalledTimes(1);
    expect(routeAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ previousVersion: 7, nextVersion: 8 }) }),
    );
  });
});
