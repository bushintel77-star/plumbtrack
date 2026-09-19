import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const { auditCreate } = vi.hoisted(() => ({
  auditCreate: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: { auditEvent: { create: auditCreate } },
}));

import { issueAuthToken, type OrganizationRole } from "../src/lib/auth";
import { buildApp } from "../src/server";

const ORG = "org-fleet-consent";
const TECH = "user-tech-consent";

function bearer(role: OrganizationRole): string {
  return `Bearer ${issueAuthToken({ userId: TECH, organizationId: ORG, role })}`;
}

describe("POST /api/fleet/location-consent", () => {
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

  it("records the choice as an org-scoped audit event and returns 204", async () => {
    const chosenAt = new Date().toISOString();
    const response = await app.inject({
      method: "POST",
      url: "/api/fleet/location-consent",
      headers: { authorization: bearer("technician") },
      payload: { mode: "points", chosenAt, opId: "location-consent-abc123" },
    });

    expect(response.statusCode).toBe(204);
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: ORG,
        action: "fleet.location_consent",
        entityType: "user",
        entityId: TECH,
      }),
    });
    const metadata = JSON.parse(auditCreate.mock.calls[0]![0].data.metadataJson);
    expect(metadata).toEqual({ mode: "points", chosenAt, opId: "location-consent-abc123" });
  });

  it("attributes consent to the authenticated user, never a body-supplied one", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/fleet/location-consent",
      headers: { authorization: bearer("technician") },
      payload: {
        mode: "shift",
        chosenAt: new Date().toISOString(),
        opId: "location-consent-def456",
        userId: "user-somebody-else",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorUserId: TECH, entityId: TECH }),
    });
  });

  it("rejects a mode outside the contract", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/fleet/location-consent",
      headers: { authorization: bearer("technician") },
      payload: { mode: "always", chosenAt: new Date().toISOString(), opId: "x" },
    });

    expect(response.statusCode).toBe(400);
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("rejects a non-technician role", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/fleet/location-consent",
      headers: { authorization: bearer("dispatcher") },
      payload: { mode: "points", chosenAt: new Date().toISOString(), opId: "x" },
    });

    expect(response.statusCode).toBe(403);
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
