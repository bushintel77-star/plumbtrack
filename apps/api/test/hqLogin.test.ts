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
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER;
    delete process.env.AUTH_SECRET;
    delete process.env.HQ_BOOTSTRAP_TOKEN;
    delete process.env.HQ_ORG_ID;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    auditCreate.mockResolvedValue({});
  });

  it("refuses in production mode — the shared station token is retired", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/hq-session",
      headers: { authorization: "Bearer station-bootstrap-token" },
    });

    expect(response.statusCode).toBe(410);
    expect(response.json().message).toMatch(/retired/);
    // No session minted, nothing audited as a sign-in.
    expect(response.cookies.find(c => c.name === "plumbtrack_hq_session")).toBeUndefined();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("refuses identically with no token — no probing surface", async () => {
    const response = await app.inject({ method: "POST", url: "/api/auth/hq-session" });
    expect(response.statusCode).toBe(410);
  });

  it("dev fallback: legacy org header still signs in as owner when the fallback is allowed", async () => {
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
      expect(auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ orgId: ORG, action: "auth.hq_sign_in" }),
        })
      );
    } finally {
      process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER = "false";
    }
  });
});
