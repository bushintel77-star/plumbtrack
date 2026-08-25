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

import { issueAuthToken, verifyAuthToken } from "../src/lib/auth";
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

describe("device enrollment", () => {
  const previousLegacySetting = process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER;
  const previousAuthSecret = process.env.AUTH_SECRET;
  const previousBootstrap = process.env.DEVICE_BOOTSTRAP_TOKEN;
  const previousDeviceOrg = process.env.DEVICE_ORG_ID;

  afterAll(() => {
    const restore = (key: string, previous: string | undefined) => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    };
    restore("PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER", previousLegacySetting);
    restore("AUTH_SECRET", previousAuthSecret);
    restore("DEVICE_BOOTSTRAP_TOKEN", previousBootstrap);
    restore("DEVICE_ORG_ID", previousDeviceOrg);
  });

  it("enrolls an owner session via the legacy header in development", async () => {
    process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER = "true";
    process.env.AUTH_SECRET = "test-auth-secret";
    delete process.env.DEVICE_BOOTSTRAP_TOKEN;
    const devApp = await buildApp({ logger: false });
    await devApp.ready();
    try {
      const response = await devApp.inject({
        method: "POST",
        url: "/api/auth/device",
        headers: { "x-organization-id": ORG },
        payload: { deviceId: "van-1" },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body).toMatchObject({ organizationId: ORG, role: "owner" });
      const claims = verifyAuthToken(body.token);
      expect(claims).toMatchObject({ userId: "van-1", organizationId: ORG, role: "owner" });
    } finally {
      await devApp.close();
    }
  });

  it("rejects production enrollment without the bootstrap secret", async () => {
    process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER = "false";
    process.env.AUTH_SECRET = "test-auth-secret";
    delete process.env.DEVICE_BOOTSTRAP_TOKEN;
    const prodApp = await buildApp({ logger: false });
    await prodApp.ready();
    try {
      const response = await prodApp.inject({
        method: "POST",
        url: "/api/auth/device",
        headers: { "x-organization-id": ORG },
        payload: { deviceId: "van-1" },
      });
      expect(response.statusCode).toBe(401);
    } finally {
      await prodApp.close();
    }
  });

  it("rejects a mismatched bootstrap secret", async () => {
    process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER = "false";
    process.env.AUTH_SECRET = "test-auth-secret";
    process.env.DEVICE_BOOTSTRAP_TOKEN = "the-real-secret";
    process.env.DEVICE_ORG_ID = ORG;
    const prodApp = await buildApp({ logger: false });
    await prodApp.ready();
    try {
      const response = await prodApp.inject({
        method: "POST",
        url: "/api/auth/device",
        headers: { authorization: "Bearer wrong-secret" },
        payload: { deviceId: "van-1" },
      });
      expect(response.statusCode).toBe(401);
    } finally {
      await prodApp.close();
    }
  });

  it("mints a technician-scoped session for a valid bootstrap secret", async () => {
    process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER = "false";
    process.env.AUTH_SECRET = "test-auth-secret";
    process.env.DEVICE_BOOTSTRAP_TOKEN = "the-real-secret";
    process.env.DEVICE_ORG_ID = ORG;
    const prodApp = await buildApp({ logger: false });
    await prodApp.ready();
    try {
      const response = await prodApp.inject({
        method: "POST",
        url: "/api/auth/device",
        headers: { authorization: "Bearer the-real-secret" },
        payload: { deviceId: "van-1" },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body).toMatchObject({ organizationId: ORG, role: "technician" });
      const claims = verifyAuthToken(body.token);
      expect(claims).toMatchObject({ userId: "van-1", organizationId: ORG, role: "technician" });
      // Sessions are long-lived for offline field devices (~30 days).
      expect(claims?.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000) + 29 * 24 * 60 * 60);
    } finally {
      await prodApp.close();
    }
  });

  it("fails fast when production enrollment lacks a device org", async () => {
    process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER = "false";
    process.env.AUTH_SECRET = "test-auth-secret";
    process.env.DEVICE_BOOTSTRAP_TOKEN = "the-real-secret";
    delete process.env.DEVICE_ORG_ID;
    const prodApp = await buildApp({ logger: false });
    await prodApp.ready();
    try {
      const response = await prodApp.inject({
        method: "POST",
        url: "/api/auth/device",
        headers: { authorization: "Bearer the-real-secret" },
        payload: { deviceId: "van-1" },
      });
      expect(response.statusCode).toBe(500);
    } finally {
      await prodApp.close();
    }
  });
});
