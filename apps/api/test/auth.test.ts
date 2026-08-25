import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const { findFirst, updateMany, findUnique, transaction, createDomainEvent } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  findUnique: vi.fn(),
  transaction: vi.fn(),
  createDomainEvent: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    job: { findFirst, updateMany, findUnique },
    domainEventOutbox: { create: createDomainEvent },
    $transaction: transaction,
  },
}));

import { issueAuthToken } from "../src/lib/auth";
import { buildApp } from "../src/server";

const ORG = "org-caulfield";

function token(role: "technician" | "manager" = "technician"): string {
  return issueAuthToken({ userId: "user-1", organizationId: ORG, role });
}

describe("authenticated tenancy and role authorization", () => {
  let app: FastifyInstance;
  const previousLegacySetting = process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER;
  const previousAuthSecret = process.env.AUTH_SECRET;

  beforeAll(async () => {
    process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER = "false";
    process.env.AUTH_SECRET = "test-auth-secret";
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    if (previousLegacySetting === undefined) delete process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER;
    else process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER = previousLegacySetting;
    if (previousAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previousAuthSecret;
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    findFirst.mockResolvedValue({ id: "J-1", orgId: ORG });
    updateMany.mockResolvedValue({ count: 1 });
    findUnique.mockResolvedValue({ id: "J-1", orgId: ORG });
    createDomainEvent.mockResolvedValue({});
    transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      job: { findFirst, findUnique, updateMany },
      domainEventOutbox: { create: createDomainEvent },
    }));
  });

  it("rejects a missing bearer session even when a tenant header is supplied", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/jobs",
      headers: { "x-organization-id": ORG },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects a tenant header that conflicts with the signed session", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/jobs",
      headers: {
        authorization: `Bearer ${token()}`,
        "x-organization-id": "another-org",
      },
    });
    expect(response.statusCode).toBe(403);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("returns the authenticated session claims without exposing token data", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { authorization: `Bearer ${token()}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      authenticated: true,
      userId: "user-1",
      organizationId: ORG,
      role: "technician",
    });
    expect(response.json()).not.toHaveProperty("token");
  });

  it("blocks a technician from changing a job", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/jobs/J-1",
      headers: { authorization: `Bearer ${token("technician")}` },
      payload: { status: "completed" },
    });
    expect(response.statusCode).toBe(403);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("allows a manager to change only a job in their organization", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/jobs/J-1",
      headers: { authorization: `Bearer ${token("manager")}` },
      payload: { status: "completed" },
    });
    expect(response.statusCode).toBe(200);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "J-1", orgId: ORG },
      data: { status: "completed" },
    });
  });
});
