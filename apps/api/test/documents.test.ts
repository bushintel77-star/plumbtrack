import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const {
  docCreate,
  docFindMany,
  docFindFirst,
  docUpdateMany,
  docUpdate,
  docDeleteMany,
  rfiCreate,
  rfiFindMany,
  rfiFindFirst,
  rfiUpdate,
  rfiUpdateMany,
  jobFindFirst,
  createAuditEvent,
} = vi.hoisted(() => ({
  docCreate: vi.fn(),
  docFindMany: vi.fn(),
  docFindFirst: vi.fn(),
  docUpdateMany: vi.fn(),
  docUpdate: vi.fn(),
  docDeleteMany: vi.fn(),
  rfiCreate: vi.fn(),
  rfiFindMany: vi.fn(),
  rfiFindFirst: vi.fn(),
  rfiUpdate: vi.fn(),
  rfiUpdateMany: vi.fn(),
  jobFindFirst: vi.fn(),
  createAuditEvent: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    jobDocument: {
      create: docCreate,
      findMany: docFindMany,
      findFirst: docFindFirst,
      updateMany: docUpdateMany,
      update: docUpdate,
      deleteMany: docDeleteMany,
    },
    rfi: {
      create: rfiCreate,
      findMany: rfiFindMany,
      findFirst: rfiFindFirst,
      update: rfiUpdate,
      updateMany: rfiUpdateMany,
    },
    job: { findFirst: jobFindFirst },
    auditEvent: { create: createAuditEvent },
  },
}));

import { buildApp } from "../src/server";

const ORG = "org_caulfield_south";

const VERSION = {
  fileName: "cert.pdf",
  size: 128_771,
  mimeType: "application/pdf",
  url: "data:application/pdf;base64,abc",
  uploadedAt: "2026-01-05T08:00:00.000Z",
  uploadedBy: "tim",
};

const STORED_DOC = {
  id: "doc-1",
  orgId: ORG,
  jobId: null,
  name: "Gas compliance certificate",
  category: "compliance",
  tags: ["gas", "compliance"],
  expiresOn: "2026-12-31T00:00:00.000Z",
  notes: "",
  currentVersion: VERSION,
  versions: [VERSION],
  createdBy: "tim",
  createdAt: "2026-01-05T08:00:00.000Z",
  updatedAt: "2026-01-05T08:00:00.000Z",
};

const STORED_RFI = {
  id: "rfi-1",
  orgId: ORG,
  jobId: "J-1",
  question: "Is the meter accessible?",
  attachmentId: null,
  status: "raised",
  raisedBy: "sarah",
  raisedAt: "2026-01-05T08:00:00.000Z",
  answer: "",
  answeredBy: null,
  answeredAt: null,
  createdAt: "2026-01-05T08:00:00.000Z",
  updatedAt: "2026-01-05T08:00:00.000Z",
};

function headers() {
  return { "x-organization-id": ORG };
}

describe("document vault routes", () => {
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
    createAuditEvent.mockResolvedValue({ id: "audit-1" });
    docCreate.mockResolvedValue(STORED_DOC);
    docFindMany.mockResolvedValue([STORED_DOC]);
    docFindFirst.mockResolvedValue(STORED_DOC);
    docUpdateMany.mockResolvedValue({ count: 1 });
    docUpdate.mockResolvedValue({ ...STORED_DOC, currentVersion: { ...VERSION, fileName: "cert-v2.pdf" } });
    docDeleteMany.mockResolvedValue({ count: 1 });
    rfiCreate.mockResolvedValue(STORED_RFI);
    rfiFindMany.mockResolvedValue([STORED_RFI]);
    rfiFindFirst.mockResolvedValue(STORED_RFI);
    rfiUpdate.mockResolvedValue({ ...STORED_RFI, status: "answered", answer: "Behind the laundry door." });
    rfiUpdateMany.mockResolvedValue({ count: 1 });
    jobFindFirst.mockResolvedValue({ id: "J-1", orgId: ORG });
  });

  it("rejects a POST without a tenant header", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/documents",
      payload: { name: "x", category: "other", createdBy: "tim", currentVersion: VERSION },
    });
    expect(response.statusCode).toBe(400);
    expect(docCreate).not.toHaveBeenCalled();
  });

  it("creates an organisation document with its first revision", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/documents",
      headers: headers(),
      payload: {
        name: "Gas compliance certificate",
        category: "compliance",
        tags: ["gas", "compliance"],
        expiresOn: "2026-12-31",
        notes: "Post-repair gas test",
        createdBy: "tim",
        currentVersion: VERSION,
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ id: "doc-1", category: "compliance" });
    expect(docCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: ORG,
        jobId: null,
        name: "Gas compliance certificate",
        category: "compliance",
        expiresOn: new Date("2026-12-31T00:00:00.000Z"),
        currentVersion: VERSION,
        versions: [VERSION],
      }),
    });
    expect(createAuditEvent).toHaveBeenCalled();
  });

  it("rejects an unknown job link before creating", async () => {
    jobFindFirst.mockResolvedValue(null);
    const response = await app.inject({
      method: "POST",
      url: "/api/documents",
      headers: headers(),
      payload: { name: "Spec", category: "spec", jobId: "J-999", createdBy: "tim", currentVersion: VERSION },
    });
    expect(response.statusCode).toBe(404);
    expect(docCreate).not.toHaveBeenCalled();
  });

  it("rejects an invalid payload without touching the database", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/documents",
      headers: headers(),
      payload: { name: "   ", category: "not-a-category", createdBy: "tim", currentVersion: VERSION },
    });
    expect(response.statusCode).toBe(400);
    expect(docCreate).not.toHaveBeenCalled();
  });

  it("lists documents, scoped to the job when asked", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/documents?jobId=J-1",
      headers: headers(),
    });
    expect(response.statusCode).toBe(200);
    expect(docFindMany).toHaveBeenCalledWith({
      where: { orgId: ORG, jobId: "J-1" },
      orderBy: { createdAt: "desc" },
    });
  });

  it("updates metadata on PATCH", async () => {
    docFindFirst.mockResolvedValue({ ...STORED_DOC, name: "Renamed" });
    const response = await app.inject({
      method: "PATCH",
      url: "/api/documents/doc-1",
      headers: headers(),
      payload: { name: "Renamed", expiresOn: null },
    });
    expect(response.statusCode).toBe(200);
    expect(docUpdateMany).toHaveBeenCalledWith({
      where: { id: "doc-1", orgId: ORG },
      data: expect.objectContaining({ name: "Renamed", expiresOn: null }),
    });
    expect(response.json().name).toBe("Renamed");
  });

  it("404s when PATCHing a document outside the org", async () => {
    docUpdateMany.mockResolvedValue({ count: 0 });
    const response = await app.inject({
      method: "PATCH",
      url: "/api/documents/doc-1",
      headers: headers(),
      payload: { name: "Renamed" },
    });
    expect(response.statusCode).toBe(404);
  });

  it("appends a new version to the history", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/documents/doc-1/versions",
      headers: headers(),
      payload: { version: { ...VERSION, fileName: "cert-v2.pdf" } },
    });
    expect(response.statusCode).toBe(200);
    expect(docUpdate).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: {
        currentVersion: expect.objectContaining({ fileName: "cert-v2.pdf" }),
        versions: [VERSION, expect.objectContaining({ fileName: "cert-v2.pdf" })],
      },
    });
  });

  it("deletes a document and unlinks RFI attachments", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/documents/doc-1",
      headers: headers(),
    });
    expect(response.statusCode).toBe(204);
    expect(docDeleteMany).toHaveBeenCalledWith({ where: { id: "doc-1", orgId: ORG } });
    expect(rfiUpdateMany).toHaveBeenCalledWith({ where: { attachmentId: "doc-1" }, data: { attachmentId: null } });
  });
});

describe("RFI routes", () => {
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
    createAuditEvent.mockResolvedValue({ id: "audit-1" });
    docFindFirst.mockResolvedValue(STORED_DOC);
    rfiCreate.mockResolvedValue(STORED_RFI);
    rfiFindMany.mockResolvedValue([STORED_RFI]);
    rfiFindFirst.mockResolvedValue(STORED_RFI);
    rfiUpdate.mockResolvedValue({ ...STORED_RFI, status: "answered", answer: "Behind the laundry door." });
    jobFindFirst.mockResolvedValue({ id: "J-1", orgId: ORG });
  });

  it("rejects raising an RFI on an unknown job", async () => {
    jobFindFirst.mockResolvedValue(null);
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/J-999/rfis",
      headers: headers(),
      payload: { question: "Is the meter accessible?", raisedBy: "sarah" },
    });
    expect(response.statusCode).toBe(404);
    expect(rfiCreate).not.toHaveBeenCalled();
  });

  it("raises an RFI against a job", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/J-1/rfis",
      headers: headers(),
      payload: { question: "Is the meter accessible?", raisedBy: "sarah" },
    });
    expect(response.statusCode).toBe(201);
    expect(rfiCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ orgId: ORG, jobId: "J-1", question: "Is the meter accessible?" }),
    });
  });

  it("validates an attached document belongs to the org", async () => {
    docFindFirst.mockResolvedValue(null);
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/J-1/rfis",
      headers: headers(),
      payload: { question: "See attached spec?", raisedBy: "sarah", attachmentId: "doc-other-org" },
    });
    expect(response.statusCode).toBe(404);
    expect(rfiCreate).not.toHaveBeenCalled();
  });

  it("lists RFIs for a job", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/jobs/J-1/rfis",
      headers: headers(),
    });
    expect(response.statusCode).toBe(200);
    expect(rfiFindMany).toHaveBeenCalledWith({ where: { jobId: "J-1", orgId: ORG }, orderBy: { raisedAt: "desc" } });
  });

  it("answers a raised RFI with the responder and timestamp", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/rfis/rfi-1",
      headers: headers(),
      payload: { answer: "Behind the laundry door.", answeredBy: "tim" },
    });
    expect(response.statusCode).toBe(200);
    expect(rfiUpdate).toHaveBeenCalledWith({
      where: { id: "rfi-1" },
      data: expect.objectContaining({ answer: "Behind the laundry door.", answeredBy: "tim" }),
    });
  });

  it("closes a resolved RFI", async () => {
    rfiUpdate.mockResolvedValue({ ...STORED_RFI, status: "closed" });
    const response = await app.inject({
      method: "PATCH",
      url: "/api/rfis/rfi-1",
      headers: headers(),
      payload: { status: "closed" },
    });
    expect(response.statusCode).toBe(200);
    expect(rfiUpdate).toHaveBeenCalledWith({ where: { id: "rfi-1" }, data: { status: "closed" } });
  });

  it("rejects an empty question", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/J-1/rfis",
      headers: headers(),
      payload: { question: "   ", raisedBy: "sarah" },
    });
    expect(response.statusCode).toBe(400);
    expect(rfiCreate).not.toHaveBeenCalled();
  });

  it("404s when answering an RFI outside the org", async () => {
    rfiFindFirst.mockResolvedValue(null);
    const response = await app.inject({
      method: "PATCH",
      url: "/api/rfis/rfi-1",
      headers: headers(),
      payload: { answer: "Nope" },
    });
    expect(response.statusCode).toBe(404);
    expect(rfiUpdate).not.toHaveBeenCalled();
  });
});
