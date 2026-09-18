import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * Team roster + membership skills (apps/api/src/routes/invites.ts —
 * teamRoutes). The skills write path is the fix for the junior-employee
 * gap: `OrganizationMembership.skills` defaulted to [] with no writer, so
 * an invited technician could never be assigned to a job declaring a
 * `requiredSkill`. The end-to-end case below drives a real assignment
 * through the same route the board uses.
 */

const {
  membershipFindMany,
  membershipFindUnique,
  membershipUpdate,
  jobFindFirst,
  userFindFirst,
  appointmentFindFirst,
  appointmentUpdateMany,
  txQueryRaw,
  auditCreate,
  sessionFindUnique,
  sessionUpdateMany,
} = vi.hoisted(() => ({
  membershipFindMany: vi.fn(),
  membershipFindUnique: vi.fn(),
  membershipUpdate: vi.fn(),
  jobFindFirst: vi.fn(),
  userFindFirst: vi.fn(),
  appointmentFindFirst: vi.fn(),
  appointmentUpdateMany: vi.fn(),
  txQueryRaw: vi.fn(),
  auditCreate: vi.fn(),
  sessionFindUnique: vi.fn(),
  sessionUpdateMany: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    organizationMembership: {
      findMany: membershipFindMany,
      findUnique: membershipFindUnique,
      update: membershipUpdate,
    },
    job: { findFirst: jobFindFirst },
    user: { findFirst: userFindFirst },
    appointment: { findFirst: appointmentFindFirst, updateMany: appointmentUpdateMany },
    session: { findUnique: sessionFindUnique, updateMany: sessionUpdateMany },
    auditEvent: { create: auditCreate },
    // The assignment route runs conflict-check + update inside an
    // interactive transaction (per-technician advisory lock).
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        $queryRaw: txQueryRaw,
        appointment: { findFirst: appointmentFindFirst, updateMany: appointmentUpdateMany },
      }),
  },
}));

import { buildApp } from "../src/server";
import { issueAuthToken, type OrganizationRole } from "../src/lib/auth";

const ORG = "org-team-test";

const sessionRows = new Map<string, Record<string, unknown>>();

function bearer(role: OrganizationRole, org = ORG): string {
  const sid = `sess-${role}-${org}`;
  sessionRows.set(sid, {
    id: sid,
    userId: "user-caller",
    organizationId: org,
    role,
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 3600_000),
    lastSeenAt: new Date(),
    revokedAt: null,
    revokedReason: null,
  });
  return `Bearer ${issueAuthToken({ userId: "user-caller", organizationId: org, role, sessionId: sid })}`;
}

function member(overrides: Record<string, unknown> = {}) {
  return {
    id: "m-1",
    organizationId: ORG,
    userId: "u-tech",
    role: "technician",
    skills: [] as string[],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    user: { name: "Dave Roper", email: "dave@mallee.example" },
    ...overrides,
  };
}

describe("team roster and member skills", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.AUTH_SECRET = "test-auth-secret";
    delete process.env.NODE_ENV;
    delete process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER;
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    auditCreate.mockResolvedValue({});
    txQueryRaw.mockResolvedValue([]);
    sessionRows.clear();
    sessionFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => sessionRows.get(where.id) ?? null);
    sessionUpdateMany.mockResolvedValue({ count: 0 });
  });

  describe("GET /api/team/members", () => {
    it("lists members org-scoped, ordered by join date, for an office role", async () => {
      membershipFindMany.mockResolvedValue([
        member({ userId: "u-owner", role: "owner", user: { name: "Sam", email: "sam@x" } }),
        member({ userId: "u-tech", role: "technician", skills: ["gas"], createdAt: new Date("2026-02-01T00:00:00.000Z") }),
      ]);

      const response = await app.inject({
        method: "GET",
        url: "/api/team/members",
        headers: { "x-organization-id": ORG, authorization: bearer("dispatcher") },
      });

      expect(response.statusCode).toBe(200);
      const { members } = response.json();
      expect(members).toHaveLength(2);
      expect(members[1]).toMatchObject({
        userId: "u-tech",
        name: "Dave Roper",
        email: "dave@mallee.example",
        role: "technician",
        skills: ["gas"],
      });
      expect(members[1].joinedAt).toBe("2026-02-01T00:00:00.000Z");
      expect(membershipFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: ORG }, orderBy: { createdAt: "asc" } }),
      );
    });

    it("returns 403 for a technician — the roster is an office surface", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/team/members",
        headers: { "x-organization-id": ORG, authorization: bearer("technician") },
      });
      expect(response.statusCode).toBe(403);
      expect(membershipFindMany).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /api/team/members/:userId", () => {
    it("lets an owner set skills, normalizing trim/case/dupes/empties", async () => {
      membershipFindUnique.mockResolvedValue(member());
      membershipUpdate.mockImplementation(async ({ data }: { data: { skills: string[] } }) =>
        member({ skills: data.skills }),
      );

      const response = await app.inject({
        method: "PATCH",
        url: "/api/team/members/u-tech",
        headers: { "x-organization-id": ORG, authorization: bearer("owner") },
        payload: { skills: [" Gas ", "gas", "", "drainage"] },
      });

      expect(response.statusCode).toBe(200);
      // " Gas " trims, "gas" dedupes case-insensitively, "" drops.
      expect(response.json().skills).toEqual(["Gas", "drainage"]);
      expect(membershipUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId_userId: { organizationId: ORG, userId: "u-tech" } },
          data: { skills: ["Gas", "drainage"] },
        }),
      );
      expect(auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "team.member_skills_updated" }),
        }),
      );
    });

    it("returns 403 for technician and dispatcher — skills are an owner/admin write", async () => {
      for (const role of ["technician", "dispatcher"] as const) {
        const response = await app.inject({
          method: "PATCH",
          url: "/api/team/members/u-tech",
          headers: { "x-organization-id": ORG, authorization: bearer(role) },
          payload: { skills: ["gas"] },
        });
        expect(response.statusCode).toBe(403);
      }
      expect(membershipUpdate).not.toHaveBeenCalled();
    });

    it("returns 404 for a userId that is a member of a different org — no existence leak", async () => {
      // The composite org+user lookup finds nothing: same 404 as a stranger.
      membershipFindUnique.mockResolvedValue(null);

      const response = await app.inject({
        method: "PATCH",
        url: "/api/team/members/u-elsewhere",
        headers: { "x-organization-id": ORG, authorization: bearer("owner") },
        payload: { skills: ["gas"] },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().message).toBe("That person isn't on your team.");
      expect(membershipUpdate).not.toHaveBeenCalled();
    });
  });

  describe("junior technician assignment end-to-end", () => {
    const jobWithSkill = {
      id: "job-1",
      orgId: ORG,
      client: "Alice",
      address: "1 Main St",
      scope: "Gas fitting",
      status: "scheduled",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      requiredSkill: "gas",
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
    };

    it("unlocks assignment once the PATCH grants the required skill", async () => {
      // Before: no skills — the exact gap invited juniors shipped with.
      jobFindFirst.mockResolvedValue(jobWithSkill);
      userFindFirst.mockResolvedValue({
        id: "u-tech",
        email: "dave@mallee.example",
        name: "Dave",
        memberships: [{ id: "m-1", organizationId: ORG, userId: "u-tech", skills: [] }],
      });
      appointmentFindFirst.mockResolvedValue(null);

      const blocked = await app.inject({
        method: "PATCH",
        url: "/api/jobs/job-1/assignment",
        headers: { "x-organization-id": ORG, authorization: bearer("dispatcher") },
        payload: { technicianId: "u-tech", startBlock: 4 },
      });
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json().message).toMatch(/lacks the required skill: gas/i);

      // The owner grants the skill through the new endpoint.
      membershipFindUnique.mockResolvedValue(member());
      membershipUpdate.mockImplementation(async ({ data }: { data: { skills: string[] } }) =>
        member({ skills: data.skills }),
      );
      const grant = await app.inject({
        method: "PATCH",
        url: "/api/team/members/u-tech",
        headers: { "x-organization-id": ORG, authorization: bearer("owner") },
        payload: { skills: ["gas"] },
      });
      expect(grant.statusCode).toBe(200);

      // After: the same assignment now passes the skill check.
      userFindFirst.mockResolvedValue({
        id: "u-tech",
        email: "dave@mallee.example",
        name: "Dave",
        memberships: [{ id: "m-1", organizationId: ORG, userId: "u-tech", skills: ["gas"] }],
      });
      appointmentUpdateMany.mockResolvedValue({ count: 1 });
      const assigned = await app.inject({
        method: "PATCH",
        url: "/api/jobs/job-1/assignment",
        headers: { "x-organization-id": ORG, authorization: bearer("dispatcher") },
        payload: { technicianId: "u-tech", startBlock: 4 },
      });
      expect(assigned.statusCode).toBe(200);
      expect(appointmentUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assignedStaffId: "u-tech" }),
        }),
      );
    });
  });
});
