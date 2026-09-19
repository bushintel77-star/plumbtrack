import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const {
  findFirst, findFirstPhoto, findFirstChecklist, updateChecklist, create, update, findMany, findUnique,
  updateMany, deleteMany, transaction, createDomainEvent, jobCreate, jobUpdate, appointmentCreate,
  updateManyTimeEntry, findFirstCustomer, findFirstProperty, findFirstQuote, findFirstChecklistTemplate,
  countChecklistTemplate, createChecklistTemplate, createManyChecklistItems, auditCreate,
} = vi.hoisted(() => ({
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
  jobCreate: vi.fn(),
  jobUpdate: vi.fn(),
  appointmentCreate: vi.fn(),
  updateManyTimeEntry: vi.fn(),
  findFirstCustomer: vi.fn(),
  findFirstProperty: vi.fn(),
  findFirstQuote: vi.fn(),
  findFirstChecklistTemplate: vi.fn(),
  countChecklistTemplate: vi.fn(),
  createChecklistTemplate: vi.fn(),
  createManyChecklistItems: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    job: { findFirst, findUnique, updateMany, deleteMany, create: jobCreate, update: jobUpdate },
    domainEventOutbox: { create: createDomainEvent },
    auditEvent: { create: auditCreate },
    $transaction: transaction,
    timeEntry: { findFirst, create, update, updateMany: updateManyTimeEntry },
    jobPhoto: { create: vi.fn(), findFirst: findFirstPhoto, deleteMany },
    checklistItem: { findFirst: findFirstChecklist, update: updateChecklist, createMany: createManyChecklistItems },
    appointment: { create: appointmentCreate },
    customer: { findFirst: findFirstCustomer },
    property: { findFirst: findFirstProperty },
    quote: { findFirst: findFirstQuote },
    checklistTemplate: {
      findFirst: findFirstChecklistTemplate,
      count: countChecklistTemplate,
      create: createChecklistTemplate,
    },
  },
}));

import { issueAuthToken, type OrganizationRole } from "../src/lib/auth";

function bearer(role: OrganizationRole): string {
  return `Bearer ${issueAuthToken({ userId: "user-tech", organizationId: ORG, role })}`;
}

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
      job: { findFirst, findUnique, updateMany, create: jobCreate },
      appointment: { create: appointmentCreate },
      domainEventOutbox: { create: createDomainEvent },
    }));
    auditCreate.mockResolvedValue({});
    countChecklistTemplate.mockResolvedValue(1); // templates exist — no default seeding
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

  it("attributes the entry to the session user when the body omits staffId", async () => {
    // The field app never sends staffId — without the backfill the entry was
    // stored unattributed (null). The verified session is the source of truth.
    findFirst.mockResolvedValueOnce(JOB); // job lookup
    findFirst.mockResolvedValueOnce(null); // no existing op
    create.mockResolvedValue(ENTRY);

    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/J-1/time-entries",
      headers: { "x-organization-id": ORG, authorization: bearer("technician") },
      payload: { opId: "op-new", start: "2024-01-01T08:00:00.000Z" },
    });

    expect(response.statusCode).toBe(201);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ staffId: "user-tech" }),
      }),
    );
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

describe("field write path (deployed field agent)", () => {
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

  // The deployed field agent's clock-out PATCHes with its outbox opId (the
  // local `te-*` id sent as clock-in `opId`), not the server cuid.
  it("lets a technician close out a time entry addressed by its opId", async () => {
    findFirst.mockResolvedValueOnce(JOB); // job lookup
    findFirst.mockResolvedValueOnce({ ...ENTRY, opId: "te-9f2" }); // id-or-opId entry lookup
    updateManyTimeEntry.mockResolvedValueOnce({ count: 1 });
    findFirst.mockResolvedValueOnce({ ...ENTRY, end: "2024-01-01T17:00:00.000Z" }); // return row

    const response = await app.inject({
      method: "PATCH",
      url: "/api/jobs/J-1/time-entries/te-9f2",
      headers: { "x-organization-id": ORG, authorization: bearer("technician") },
      payload: { end: "2024-01-01T17:00:00.000Z" },
    });

    expect(response.statusCode).toBe(200);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ jobId: "J-1", OR: [{ id: "te-9f2" }, { opId: "te-9f2" }] }),
      }),
    );
    expect(updateManyTimeEntry).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cuid-1", jobId: "J-1" } }),
    );
  });

  it("forbids a technician from editing staffId or start (timesheet correction is manager+)", async () => {
    findFirst.mockResolvedValueOnce(JOB);

    const response = await app.inject({
      method: "PATCH",
      url: "/api/jobs/J-1/time-entries/te-9f2",
      headers: { "x-organization-id": ORG, authorization: bearer("technician") },
      payload: { end: "2024-01-01T17:00:00.000Z", staffId: "someone-else" },
    });

    expect(response.statusCode).toBe(403);
    expect(updateManyTimeEntry).not.toHaveBeenCalled();
  });

  it("resolves the literal 'open' entryId to the caller's open entry on the job", async () => {
    // The field app enqueues clock-out with entryId null when it has no local
    // open entry — "open" lets that op still close the server-side row
    // instead of silently consuming itself.
    findFirst.mockResolvedValueOnce(JOB); // job lookup
    findFirst.mockResolvedValueOnce({ ...ENTRY, staffId: "user-tech", end: null }); // open-entry lookup
    updateManyTimeEntry.mockResolvedValueOnce({ count: 1 });
    findFirst.mockResolvedValueOnce({ ...ENTRY, end: "2024-01-01T17:00:00.000Z" }); // return row

    const response = await app.inject({
      method: "PATCH",
      url: "/api/jobs/J-1/time-entries/open",
      headers: { "x-organization-id": ORG, authorization: bearer("technician") },
      payload: { end: "2024-01-01T17:00:00.000Z" },
    });

    expect(response.statusCode).toBe(200);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jobId: "J-1", staffId: "user-tech", end: null },
      }),
    );
    expect(updateManyTimeEntry).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cuid-1", jobId: "J-1" } }),
    );
  });

  it("404s an 'open' clock-out when the caller has no open entry — the client learns definitively", async () => {
    findFirst.mockResolvedValueOnce(JOB);
    findFirst.mockResolvedValueOnce(null); // no open entry for this user

    const response = await app.inject({
      method: "PATCH",
      url: "/api/jobs/J-1/time-entries/open",
      headers: { "x-organization-id": ORG, authorization: bearer("technician") },
      payload: { end: "2024-01-01T17:00:00.000Z" },
    });

    expect(response.statusCode).toBe(404);
    expect(updateManyTimeEntry).not.toHaveBeenCalled();
  });

  it("404s a clock-out whose entry id/opId belongs to no entry on the job", async () => {
    findFirst.mockResolvedValueOnce(JOB);
    findFirst.mockResolvedValueOnce(null); // entry lookup misses

    const response = await app.inject({
      method: "PATCH",
      url: "/api/jobs/J-1/time-entries/te-unknown",
      headers: { "x-organization-id": ORG, authorization: bearer("technician") },
      payload: { end: "2024-01-01T17:00:00.000Z" },
    });

    expect(response.statusCode).toBe(404);
    expect(updateManyTimeEntry).not.toHaveBeenCalled();
  });

  it("stores a customer sign-off on the job (last-write-wins)", async () => {
    findFirst.mockResolvedValueOnce(JOB);
    jobUpdate.mockResolvedValueOnce({ ...JOB, signature: "data:image/png;base64,sig" });

    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/J-1/signoff",
      headers: { "x-organization-id": ORG, authorization: bearer("technician") },
      payload: { opId: "so-1", signatureData: "data:image/png;base64,sig", signedAt: "2024-01-01T16:55:00.000Z" },
    });

    expect(response.statusCode).toBe(200);
    expect(jobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "J-1" }, data: { signature: "data:image/png;base64,sig" } }),
    );
  });

  it("rejects sign-off on a job outside the org", async () => {
    findFirst.mockResolvedValueOnce(null);

    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/J-x/signoff",
      headers: { "x-organization-id": ORG, authorization: bearer("technician") },
      payload: { signatureData: "data:image/png;base64,sig" },
    });

    expect(response.statusCode).toBe(404);
    expect(jobUpdate).not.toHaveBeenCalled();
  });

  it("records an arrival event and never rewinds it (monotonic earliest-wins)", async () => {
    findFirst.mockResolvedValueOnce({ ...JOB, arrivedAt: null, departedAt: null });
    jobUpdate.mockResolvedValueOnce({});

    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/J-1/events",
      headers: { "x-organization-id": ORG, authorization: bearer("technician") },
      payload: { opId: "ev-1", event: "arrived", occurredAt: "2024-01-01T08:05:00.000Z" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ arrivedAt: "2024-01-01T08:05:00.000Z" });
    expect(jobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { arrivedAt: new Date("2024-01-01T08:05:00.000Z") } }),
    );

    // A delayed/duplicated earlier arrival overwrites; a later one must not.
    vi.clearAllMocks();
    const earlier = { ...JOB, arrivedAt: new Date("2024-01-01T08:05:00.000Z"), departedAt: null };
    findFirst.mockResolvedValue(earlier);

    const lateRetry = await app.inject({
      method: "POST",
      url: "/api/jobs/J-1/events",
      headers: { "x-organization-id": ORG, authorization: bearer("technician") },
      payload: { opId: "ev-2", event: "arrived", occurredAt: "2024-01-01T08:20:00.000Z" },
    });
    expect(lateRetry.statusCode).toBe(200);
    expect(lateRetry.json()).toMatchObject({ arrivedAt: "2024-01-01T08:05:00.000Z" });
    expect(jobUpdate).not.toHaveBeenCalled();
  });

  it("rejects a departure event with a garbage timestamp", async () => {
    findFirst.mockResolvedValueOnce(JOB);

    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/J-1/events",
      headers: { "x-organization-id": ORG, authorization: bearer("technician") },
      payload: { event: "departed", occurredAt: "not-a-date" },
    });

    expect(response.statusCode).toBe(400);
    expect(jobUpdate).not.toHaveBeenCalled();
  });
});

describe("POST /api/jobs intake (auto schedulable appointment)", () => {
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
    countChecklistTemplate.mockResolvedValue(1);
    findFirstChecklistTemplate.mockResolvedValue(null);
    createDomainEvent.mockResolvedValue({});
    jobCreate.mockResolvedValue({ id: "J-new", orgId: ORG, status: "scheduled", client: "Pat", address: "1 Oak St", scope: "Leak" });
    appointmentCreate.mockResolvedValue({ id: "ap-new", orgId: ORG, jobId: "J-new" });
    findFirst.mockResolvedValue({ id: "J-new", orgId: ORG, appointments: [{ id: "ap-new" }] });
    transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      job: { create: jobCreate, findFirst, findUnique, updateMany },
      appointment: { create: appointmentCreate },
      domainEventOutbox: { create: createDomainEvent },
    }));
  });

  it("creates the job and an unassigned appointment in one transaction", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers: { "x-organization-id": ORG },
      payload: { client: "Pat", address: "1 Oak St", scope: "Leak", scheduledStart: "2026-09-15T08:00:00.000Z" },
    });

    expect(response.statusCode).toBe(201);
    expect(appointmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orgId: ORG,
          jobId: "J-new",
          scheduledStart: new Date("2026-09-15T08:00:00.000Z"),
        }),
      }),
    );
    // The response include carries the appointment so the board can render it.
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ include: expect.objectContaining({ appointments: expect.anything() }) }),
    );
  });

  it("defaults the appointment to the next board-day block when unscheduled", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers: { "x-organization-id": ORG },
      payload: { client: "Pat", address: "1 Oak St", scope: "Leak" },
    });

    expect(response.statusCode).toBe(201);
    const data = appointmentCreate.mock.calls[0][0].data as { scheduledStart: Date; scheduledEnd: Date };
    expect(data.scheduledStart.getUTCHours()).toBe(8);
    expect(data.scheduledEnd.getTime() - data.scheduledStart.getTime()).toBe(30 * 60 * 1000);
  });

  it("still requires office roles — a technician cannot create jobs", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers: { authorization: bearer("technician") },
      payload: { client: "Pat", address: "1 Oak St", scope: "Leak" },
    });

    expect(response.statusCode).toBe(403);
    expect(jobCreate).not.toHaveBeenCalled();
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
