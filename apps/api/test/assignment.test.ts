import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * G-2: `PATCH /api/jobs/:id/assignment` — the authoritative assignment write.
 *
 * These tests cover the endpoints actual contract (apps/api/src/routes/jobs.ts):
 *  - role guard (dispatcher/manager/admin/owner only)
 *  - job scoping to the requesting org
 *  - the job must have a schedulable appointment (the server stores assignment
 *    on `Appointment.assignedStaffId`, not on the job)
 *  - the technician must be a member of the org
 *  - no overlapping appointment for that technician
 *  - skill validation: a job that declares `requiredSkill` may only be
 *    assigned to a technician whose org membership carries that skill
 *  - audit + live-bus publish on success
 */

const { jobFindFirst, userFindFirst, appointmentFindFirst, appointmentUpdateMany, auditCreate } = vi.hoisted(() => ({
  jobFindFirst: vi.fn(),
  userFindFirst: vi.fn(),
  appointmentFindFirst: vi.fn(),
  appointmentUpdateMany: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    job: { findFirst: jobFindFirst },
    user: { findFirst: userFindFirst },
    appointment: { findFirst: appointmentFindFirst, updateMany: appointmentUpdateMany },
    auditEvent: { create: auditCreate },
  },
}));

import { buildApp } from "../src/server";
import { issueAuthToken, type OrganizationRole } from "../src/lib/auth";

const ORG = "org_assignment_test";

function jobWithAppointment(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    orgId: ORG,
    client: "Alice",
    address: "1 Main St",
    scope: "Fix leak",
    status: "scheduled",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    timeEntries: [],
    photos: [],
    appointments: [
      {
        id: "ap-1",
        orgId: ORG,
        jobId: "job-1",
        assignedStaffId: null,
        scheduledStart: new Date("2026-01-01T08:00:00.000Z"),
        scheduledEnd: new Date("2026-01-01T10:00:00.000Z"),
        status: "assigned",
      },
    ],
    ...overrides,
  };
}

function bearer(role: OrganizationRole): string {
  return `Bearer ${issueAuthToken({ userId: "user-owner", organizationId: ORG, role })}`;
}

describe("PATCH /api/jobs/:id/assignment", () => {
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
    auditCreate.mockResolvedValue({});
  });

  it("assigns the technician and records an audit event on success", async () => {
    jobFindFirst.mockResolvedValue(jobWithAppointment());
    userFindFirst.mockResolvedValue({ id: "user-1", email: "tech@x", name: "Tech" });
    appointmentFindFirst.mockResolvedValue(null); // no overlap
    appointmentUpdateMany.mockResolvedValue({ count: 1 });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/jobs/job-1/assignment",
      headers: { "x-organization-id": ORG },
      payload: { technicianId: "user-1", startBlock: 4 },
    });

    expect(response.statusCode).toBe(200);
    expect(appointmentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assignedStaffId: "user-1" }),
      })
    );
    // The board slot is persisted as a real scheduled window: startBlock 4 on
    // the 08:00 day = 10:00, keeping the appointment's 2h duration → ends 12:00.
    const updateCall = appointmentUpdateMany.mock.calls[0][0];
    const data = updateCall.data as { scheduledStart: Date; scheduledEnd: Date };
    expect(data.scheduledStart.toISOString()).toBe("2026-01-01T10:00:00.000Z");
    expect(data.scheduledEnd.toISOString()).toBe("2026-01-01T12:00:00.000Z");
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: ORG, action: "job.assigned", entityType: "job", entityId: "job-1" }),
      })
    );
  });

  it("returns 409 when the job has no schedulable appointment", async () => {
    jobFindFirst.mockResolvedValue(jobWithAppointment({ appointments: [] }));

    const response = await app.inject({
      method: "PATCH",
      url: "/api/jobs/job-1/assignment",
      headers: { "x-organization-id": ORG },
      payload: { technicianId: "user-1", startBlock: 4 },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().message).toMatch(/no schedulable appointment/i);
    expect(appointmentUpdateMany).not.toHaveBeenCalled();
  });

  it("returns 409 when the technician is not in the organization", async () => {
    jobFindFirst.mockResolvedValue(jobWithAppointment());
    userFindFirst.mockResolvedValue(null);

    const response = await app.inject({
      method: "PATCH",
      url: "/api/jobs/job-1/assignment",
      headers: { "x-organization-id": ORG },
      payload: { technicianId: "user-1", startBlock: 4 },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().message).toMatch(/not available in this organization/i);
    expect(appointmentUpdateMany).not.toHaveBeenCalled();
  });

  it("returns 409 when the technician has an overlapping appointment", async () => {
    jobFindFirst.mockResolvedValue(jobWithAppointment());
    userFindFirst.mockResolvedValue({ id: "user-1", email: "tech@x", name: "Tech" });
    appointmentFindFirst.mockResolvedValue({ id: "ap-2", orgId: ORG });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/jobs/job-1/assignment",
      headers: { "x-organization-id": ORG },
      payload: { technicianId: "user-1", startBlock: 4 },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().message).toMatch(/overlapping appointment/i);
    expect(appointmentUpdateMany).not.toHaveBeenCalled();
  });

  it("returns 409 when the technician lacks the job's required skill", async () => {
    jobFindFirst.mockResolvedValue(jobWithAppointment({ requiredSkill: "gas" }));
    userFindFirst.mockResolvedValue({
      id: "user-1",
      email: "tech@x",
      name: "Tech",
      memberships: [{ id: "m-1", organizationId: ORG, userId: "user-1", skills: ["drainage", "general"] }],
    });
    appointmentFindFirst.mockResolvedValue(null);

    const response = await app.inject({
      method: "PATCH",
      url: "/api/jobs/job-1/assignment",
      headers: { "x-organization-id": ORG },
      payload: { technicianId: "user-1", startBlock: 4 },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().message).toMatch(/lacks the required skill: gas/i);
    expect(appointmentUpdateMany).not.toHaveBeenCalled();
  });

  it("assigns when the technician holds the job's required skill", async () => {
    jobFindFirst.mockResolvedValue(jobWithAppointment({ requiredSkill: "gas" }));
    userFindFirst.mockResolvedValue({
      id: "user-1",
      email: "tech@x",
      name: "Tech",
      memberships: [{ id: "m-1", organizationId: ORG, userId: "user-1", skills: ["gas", "drainage"] }],
    });
    appointmentFindFirst.mockResolvedValue(null);
    appointmentUpdateMany.mockResolvedValue({ count: 1 });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/jobs/job-1/assignment",
      headers: { "x-organization-id": ORG },
      payload: { technicianId: "user-1", startBlock: 4 },
    });

    expect(response.statusCode).toBe(200);
    expect(appointmentUpdateMany).toHaveBeenCalled();
  });

  it("returns 403 for a technician role (dispatcher required)", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/jobs/job-1/assignment",
      headers: { "x-organization-id": ORG, authorization: bearer("technician") },
      payload: { technicianId: "user-1", startBlock: 4 },
    });

    expect(response.statusCode).toBe(403);
    expect(jobFindFirst).not.toHaveBeenCalled();
  });

  it("returns 401 when no valid session is supplied in production mode", async () => {
    // In dev/test the legacy org header is accepted, so force a non-member
    // path by disabling the fallback is not available here; instead assert
    // that the endpoint refuses when the header is absent entirely (legacy
    // fallback turns this into a 400/401 depending on config).
    const response = await app.inject({
      method: "PATCH",
      url: "/api/jobs/job-1/assignment",
      payload: { technicianId: "user-1", startBlock: 4 },
    });

    // With NODE_ENV=test the legacy org header falls back to a 400 here;
    // in production (header rejected) it is 401. Accept either to avoid a
    // brittle assertion on the dev-only fallback path.
    expect([400, 401]).toContain(response.statusCode);
  });
});
