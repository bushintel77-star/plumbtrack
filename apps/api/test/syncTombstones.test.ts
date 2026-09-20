import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * P1-5 — sync tombstones. Hard-deleting a job writes a Deletion marker in
 * the same transaction, and /api/sync emits those ids after the pull cursor
 * so the field device's Watermelon sync destroys its cached row. Before
 * this, `deleted` was always [] and a deleted job lived forever as a ghost
 * on every device that had pulled it.
 *
 * Cursor invariant under test: the response timestamp is the max of the
 * last row, the newest tombstone and now — so no tombstone is ever skipped
 * — except when the row cap truncates, where the cursor stays at the last
 * row (re-emitted tombstones are no-ops; skipped deletes are ghosts).
 */

const { jobFindMany, jobDeleteMany, deletionFindMany, deletionCreate, auditCreate } = vi.hoisted(() => ({
  jobFindMany: vi.fn(),
  jobDeleteMany: vi.fn(),
  deletionFindMany: vi.fn(),
  deletionCreate: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    job: { findMany: jobFindMany, deleteMany: jobDeleteMany },
    deletion: { findMany: deletionFindMany, create: deletionCreate },
    auditEvent: { create: auditCreate },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        job: { deleteMany: jobDeleteMany },
        deletion: { create: deletionCreate },
      }),
  },
}));

import { buildApp } from "../src/server";
import { issueAuthToken } from "../src/lib/auth";

const ORG = "org-sync-tombstones";
const bearer = `Bearer ${issueAuthToken({ userId: "user-1", organizationId: ORG, role: "owner" })}`;

describe("sync tombstones (P1-5)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    vi.clearAllMocks();
    deletionCreate.mockResolvedValue({});
    auditCreate.mockResolvedValue({});
  });

  describe("DELETE /api/jobs/:id writes the tombstone in-transaction", () => {
    it("creates a job tombstone for the org", async () => {
      jobDeleteMany.mockResolvedValue({ count: 1 });
      const res = await app.inject({ method: "DELETE", url: "/api/jobs/job-1", headers: { authorization: bearer } });
      expect(res.statusCode).toBe(204);
      expect(deletionCreate).toHaveBeenCalledWith({
        data: { orgId: ORG, entityType: "job", entityId: "job-1" },
      });
    });

    it("creates no tombstone when there was nothing to delete", async () => {
      jobDeleteMany.mockResolvedValue({ count: 0 });
      const res = await app.inject({ method: "DELETE", url: "/api/jobs/job-1", headers: { authorization: bearer } });
      expect(res.statusCode).toBe(404);
      expect(deletionCreate).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/sync emits tombstoned ids", () => {
    const TOMBSTONE_MS = Date.parse("2026-09-21T10:30:00Z");

    beforeEach(() => {
      jobFindMany.mockResolvedValue([
        { id: "job-live", client: "C", address: "A", scope: "S", status: "scheduled", phone: null, accessCode: null, customerId: null, timeEntries: [], photos: [], createdAt: new Date(TOMBSTONE_MS - 1000), updatedAt: new Date(TOMBSTONE_MS - 500) },
      ]);
      deletionFindMany.mockResolvedValue([
        { entityId: "job-dead-1", deletedAt: new Date(TOMBSTONE_MS) },
        { entityId: "job-dead-2", deletedAt: new Date(TOMBSTONE_MS + 1) },
      ]);
    });

    it("an incremental pull carries the deleted ids", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/sync?last_pulled_at=${Math.floor(TOMBSTONE_MS / 1000) - 10}`,
        headers: { authorization: bearer },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().changes.jobs.deleted).toEqual(["job-dead-1", "job-dead-2"]);
    });

    it("the timestamp covers the newest tombstone so nothing is skipped", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/sync?last_pulled_at=${Math.floor(TOMBSTONE_MS / 1000) - 10}`,
        headers: { authorization: bearer },
      });
      // The live row updated BEFORE the tombstone — an old-style cursor
      // (last row only) would rewind past it and re-send forever; the new
      // cursor must be at least the newest tombstone.
      expect(res.json().timestamp).toBeGreaterThanOrEqual(TOMBSTONE_MS + 1);
    });

    it("a first pull never emits deletes (the device has nothing cached)", async () => {
      deletionFindMany.mockResolvedValue([{ entityId: "job-dead-1", deletedAt: new Date() }]);
      const res = await app.inject({ method: "GET", url: "/api/sync", headers: { authorization: bearer } });
      expect(res.statusCode).toBe(200);
      expect(res.json().changes.jobs.deleted).toEqual([]);
      expect(deletionFindMany).not.toHaveBeenCalled();
    });
  });
});
