import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const { auditCreate } = vi.hoisted(() => ({
  auditCreate: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: { auditEvent: { create: auditCreate } },
}));

import { buildApp } from "../src/server";

const ORG = "org_hq_login";

describe("POST /api/auth/hq-session", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Simulate a production configuration: legacy tenant header disabled,
    // signed sessions required, station bootstrap secret configured.
    process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER = "false";
    process.env.AUTH_SECRET = "test-signing-secret";
    process.env.HQ_BOOTSTRAP_TOKEN = "station-bootstrap-token";
    process.env.HQ_ORG_ID = ORG;
    process.env.HQ_OPERATOR_ROLE = "dispatcher";
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER;
    delete process.env.AUTH_SECRET;
    delete process.env.HQ_BOOTSTRAP_TOKEN;
    delete process.env.HQ_ORG_ID;
    delete process.env.HQ_OPERATOR_ROLE;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    auditCreate.mockResolvedValue({});
  });

  it("mints a station-role session for a valid bootstrap token", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/hq-session",
      headers: { authorization: "Bearer station-bootstrap-token" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.organizationId).toBe(ORG);
    expect(body.role).toBe("dispatcher");
    expect(response.cookies.find(c => c.name === "plumbtrack_hq_session")).toBeTruthy();
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: ORG, action: "auth.hq_sign_in" }),
      })
    );
  });

  it("rejects a wrong bootstrap token", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/hq-session",
      headers: { authorization: "Bearer wrong-token" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects a request with no token", async () => {
    const response = await app.inject({ method: "POST", url: "/api/auth/hq-session" });
    expect(response.statusCode).toBe(401);
  });

  it("defaults the role to owner when HQ_OPERATOR_ROLE is unset", async () => {
    delete process.env.HQ_OPERATOR_ROLE;
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/hq-session",
        headers: { authorization: "Bearer station-bootstrap-token" },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().role).toBe("owner");
    } finally {
      process.env.HQ_OPERATOR_ROLE = "dispatcher";
    }
  });

  it("rejects a field-only role for a station session", async () => {
    process.env.HQ_OPERATOR_ROLE = "technician";
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/hq-session",
        headers: { authorization: "Bearer station-bootstrap-token" },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json().message).toMatch(/HQ_OPERATOR_ROLE/);
    } finally {
      process.env.HQ_OPERATOR_ROLE = "dispatcher";
    }
  });

  it("dev fallback: legacy org header signs in as owner when the fallback is allowed", async () => {
    delete process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER;
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/hq-session",
        headers: { "x-organization-id": ORG },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().role).toBe("owner");
      expect(response.json().organizationId).toBe(ORG);
    } finally {
      process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER = "false";
    }
  });
});
