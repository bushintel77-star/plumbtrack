import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const { findFirst, findFirstPhoto, findFirstChecklist, updateChecklist, create, update, findMany, findUnique, updateMany, deleteMany, transaction, createDomainEvent } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findFirstPhoto: vi.fn(),
  findFirstChecklist: vi.fn(),
  updateChecklist: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
  transaction: vi.fn(),
  createDomainEvent: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    job: { findFirst, findUnique, updateMany, deleteMany },
    domainEventOutbox: { create: createDomainEvent },
    $transaction: transaction,
    timeEntry: { findFirst, create, update },
    jobPhoto: { create: vi.fn(), findFirst: findFirstPhoto, deleteMany },
    checklistItem: { findFirst: findFirstChecklist, update: updateChecklist },
  },
}));

import { buildApp } from "../src/server";

const ORG = "org_caulfield_south";
const JOB = { id: "J-1", orgId: ORG, status: "in_progress" };
const ENTRY = {
  id: "cuid-1",
  jobId: "J-1",
  staffId: "sarah",
  opId: "op-abc",
  start: "2024-01-01T08:00:00.000Z",
  end: null,
};

describe("time-entry sync (opId idempotency)", () => {
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
    findMany.mockResolvedValue([]);
    findFirstPhoto.mockResolvedValue(null);
    findUnique.mockResolvedValue(JOB);
    updateMany.mockResolvedValue({ count: 1 });
    deleteMany.mockResolvedValue({ count: 1 });
    createDomainEvent.mockResolvedValue({});
    transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      job: { findFirst, findUnique, updateMany },
      domainEventOutbox: { create: createDomainEvent },
    }));
  });

  it("creates the entry when the opId is new", async () => {
    findFirst.mockResolvedValueOnce(JOB); // job lookup
    findFirst.mockResolvedValueOnce(null); // no existing op
    create.mockResolvedValue(ENTRY);

    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/J-1/time-entries",
      headers: { "x-organization-id": ORG },
      payload: { opId: "op-abc", staffId: "sarah", start: "2024-01-01T08:00:00.000Z", lat: -37.89, lng: 145.02 },
    });

    expect(response.statusCode).toBe(201);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ jobId: "J-1", opId: "op-abc", staffId: "sarah", lat: -37.89, lng: 145.02 }),
      }),
    );
  });

  it("replays idempotently — returns the existing entry instead of duplicating", async () => {
    findFirst.mockResolvedValueOnce(JOB); // job lookup
    findFirst.mockResolvedValueOnce(ENTRY); // existing op found

    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/J-1/time-entries",
      headers: { "x-organization-id": ORG },
      payload: { opId: "op-abc", staffId: "sarah", start: "2024-01-01T08:00:00.000Z" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ id: "cuid-1" });
    expect(create).not.toHaveBeenCalled();
  });

  it("does not duplicate a photo when an upload retry reuses its opId", async () => {
    findFirst.mockResolvedValueOnce(JOB); // job lookup
    findFirstPhoto.mockResolvedValue({ id: "photo-1", jobId: "J-1", opId: "photo-op" });

    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/J-1/photos",
      headers: { "x-organization-id": ORG },
      payload: { opId: "photo-op", label: "Before", url: "data:image/jpeg;base64,mock" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ id: "photo-1" });
    expect(create).not.toHaveBeenCalled();
  });

  it("writes a provider-neutral completion event in the job transaction", async () => {
    const eventRows: unknown[] = [];
    createDomainEvent.mockImplementation(async (args: unknown) => { eventRows.push(args); });
    findFirst.mockResolvedValueOnce({ ...JOB, status: "in_progress" });
    findUnique.mockResolvedValue({
      ...JOB,
      status: "completed",
      signature: "data:image/png;base64,signature",
      timeEntries: [{ start: new Date("2026-08-24T08:00:00.000Z"), end: new Date("2026-08-24T09:00:00.000Z") }],
      photos: [{ id: "photo-1" }, { id: "photo-2" }],
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/jobs/J-1",
      headers: { "x-organization-id": ORG },
      payload: { status: "completed" },
    });

    expect(response.statusCode).toBe(200);
    expect(eventRows).toHaveLength(1);
    expect(eventRows[0]).toEqual(expect.objectContaining({ data: expect.objectContaining({ eventId: "job.completed:org_caulfield_south:J-1", type: "job.completed" }) }));
  });

  it("rejects time-entry creation on a missing job", async () => {
    findFirst.mockResolvedValueOnce(null); // job not found
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/J-1/time-entries",
      headers: { "x-organization-id": ORG },
      payload: { opId: "op-abc", staffId: "sarah", start: "2024-01-01T08:00:00.000Z" },
    });
    expect(response.statusCode).toBe(404);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("tenant scoping on nested resources", () => {
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

  it("completes a checklist item scoped to the caller's org", async () => {
    findFirstChecklist.mockResolvedValueOnce({ id: "item-1", jobId: "J-1", label: "Shut off water" });
    updateChecklist.mockResolvedValueOnce({ id: "item-1", completedAt: new Date() });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/jobs/J-1/checklist-items/item-1",
      headers: { "x-organization-id": ORG },
      payload: { completed: true },
    });

    expect(response.statusCode).toBe(200);
    expect(findFirstChecklist).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "item-1", jobId: "J-1", orgId: ORG } }),
    );
  });

  it("404s a checklist item that exists in another org", async () => {
    // The org-scoped lookup returns nothing for a foreign item id, even when
    // the item + job id pair is real.
    findFirstChecklist.mockResolvedValueOnce(null);

    const response = await app.inject({
      method: "PATCH",
      url: "/api/jobs/J-1/checklist-items/item-1",
      headers: { "x-organization-id": ORG },
      payload: { completed: true },
    });

    expect(response.statusCode).toBe(404);
    expect(updateChecklist).not.toHaveBeenCalled();
  });

  it("deletes a photo only after verifying the parent job's org", async () => {
    findFirst.mockResolvedValueOnce(JOB);
    deleteMany.mockResolvedValueOnce({ count: 1 });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/jobs/J-1/photos/photo-1",
      headers: { "x-organization-id": ORG },
    });

    expect(response.statusCode).toBe(204);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "J-1", orgId: ORG } }),
    );
    expect(deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "photo-1", jobId: "J-1" } }),
    );
  });

  it("refuses to delete a photo on a job from another org", async () => {
    findFirst.mockResolvedValueOnce(null); // job not visible to this org

    const response = await app.inject({
      method: "DELETE",
      url: "/api/jobs/J-1/photos/photo-1",
      headers: { "x-organization-id": ORG },
    });

    expect(response.statusCode).toBe(404);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
