import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const { findFirst, findMany, prismaCreate, transaction, createDomainEvent } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  prismaCreate: vi.fn(),
  transaction: vi.fn(),
  createDomainEvent: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    job: { findFirst, findMany },
    notification: { findFirst: vi.fn(), create: prismaCreate },
    timeEntry: { findFirst: vi.fn(), create: vi.fn().mockResolvedValue({ id: "t-1" }) },
    jobPhoto: { findFirst: vi.fn(), create: vi.fn().mockResolvedValue({ id: "p-1" }) },
    domainEventOutbox: { create: createDomainEvent },
    $transaction: transaction,
  },
}));

import { issueAuthToken, type OrganizationRole } from "../src/lib/auth";
import { buildApp } from "../src/server";

const ORG = "org-caulfield";

function token(role: OrganizationRole): string {
  return issueAuthToken({ userId: "user-1", organizationId: ORG, role });
}

/**
 * The tenant fallback is evaluated per request from process.env, so one app
 * instance can exercise both the fail-closed default and the explicit
 * development opt-in.
 */
function setEnvironment(mode: "unset" | "development" | "legacy-explicit"): void {
  delete process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER;
  if (mode === "unset") {
    delete process.env.NODE_ENV;
  } else if (mode === "development") {
    process.env.NODE_ENV = "development";
  } else {
    delete process.env.NODE_ENV;
    process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER = "true";
  }
}

describe("tenant fallback fails closed", () => {
  let app: FastifyInstance;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousLegacy = process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER;
  const previousSecret = process.env.AUTH_SECRET;

  beforeAll(async () => {
    process.env.AUTH_SECRET = "test-auth-secret";
    setEnvironment("unset");
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousLegacy === undefined) delete process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER;
    else process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER = previousLegacy;
    if (previousSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previousSecret;
    await app.close();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects the legacy tenant header when NODE_ENV is unset", async () => {
    setEnvironment("unset");
    const response = await app.inject({
      method: "GET",
      url: "/api/jobs",
      headers: { "x-organization-id": ORG },
    });
    expect(response.statusCode).toBe(401);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("accepts the legacy tenant header only in explicit development mode", async () => {
    setEnvironment("development");
    const response = await app.inject({
      method: "GET",
      url: "/api/jobs",
      headers: { "x-organization-id": ORG },
    });
    expect(response.statusCode).toBe(200);
  });

  it("accepts the legacy tenant header with an explicit opt-in flag", async () => {
    setEnvironment("legacy-explicit");
    const response = await app.inject({
      method: "GET",
      url: "/api/jobs",
      headers: { "x-organization-id": ORG },
    });
    expect(response.statusCode).toBe(200);
  });
});

describe("field operations require an authorized role", () => {
  let app: FastifyInstance;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSecret = process.env.AUTH_SECRET;

  beforeAll(async () => {
    process.env.AUTH_SECRET = "test-auth-secret";
    delete process.env.NODE_ENV;
    delete process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER;
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previousSecret;
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    findFirst.mockResolvedValue({ id: "J-1", orgId: ORG });
    findMany.mockResolvedValue([]);
    prismaCreate.mockResolvedValue({ id: "n-1", orgId: ORG, channel: "general", author: "tim", text: "hello" });
    transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      notification: { create: prismaCreate },
      domainEventOutbox: { create: createDomainEvent },
    }));
  });

  it("blocks an unauthenticated notification post even with a tenant header", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/notifications",
      headers: { "x-organization-id": ORG },
      payload: { text: "hello", channel: "general", author: "tim" },
    });
    expect(response.statusCode).toBe(401);
    expect(prismaCreate).not.toHaveBeenCalled();
  });

  it("allows a technician to post a notification", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/notifications",
      headers: { authorization: `Bearer ${token("technician")}` },
      payload: { text: "hello", channel: "general", author: "tim" },
    });
    expect(response.statusCode).toBe(201);
    expect(prismaCreate).toHaveBeenCalledTimes(1);
  });

  it("allows a technician to clock in on a job", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs/J-1/time-entries",
      headers: { authorization: `Bearer ${token("technician")}` },
      payload: { staffId: "tim", start: "2026-01-05T07:00:00.000Z", lat: null, lng: null },
    });
    expect(response.statusCode).toBe(201);
  });

  it("blocks an accountant from clocking in or uploading photos", async () => {
    const timeEntry = await app.inject({
      method: "POST",
      url: "/api/jobs/J-1/time-entries",
      headers: { authorization: `Bearer ${token("accountant")}` },
      payload: { staffId: "tim", start: "2026-01-05T07:00:00.000Z" },
    });
    expect(timeEntry.statusCode).toBe(403);

    const photo = await app.inject({
      method: "POST",
      url: "/api/jobs/J-1/photos",
      headers: { authorization: `Bearer ${token("accountant")}` },
      payload: { label: "Before", url: "" },
    });
    expect(photo.statusCode).toBe(403);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
