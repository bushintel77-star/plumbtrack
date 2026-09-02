import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

// liveBus publish is the only outward effect of this route — spy on it.
vi.mock("../src/lib/liveBus", () => ({
  publishToOrg: vi.fn(),
}));
import { publishToOrg } from "../src/lib/liveBus";

import { issueAuthToken, type OrganizationRole } from "../src/lib/auth";
import { buildApp } from "../src/server";

const ORG = "org-fleet-test";

function bearer(role: OrganizationRole): string {
  return `Bearer ${issueAuthToken({ userId: "user-dev", organizationId: ORG, role })}`;
}

describe("POST /api/fleet/telemetry", () => {
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

  it("accepts a technician fix, publishes an org-scoped telemetry frame, and returns 202", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/fleet/telemetry",
      headers: { authorization: bearer("technician") },
      payload: { vehicleId: "van-2", techId: "t-mike", lat: -37.82, lng: 144.98, heading: 125, speed: 42.5 },
    });

    expect(response.statusCode).toBe(202);
    expect(publishToOrg).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "topic/fleet/telemetry",
        orgId: ORG,
        vehicleId: "van-2",
        techId: "t-mike",
        lat: -37.82,
        lng: 144.98,
        heading: 125,
        speed: 42.5,
      })
    );
  });

  it("rejects a request with no org context (test env uses the legacy fallback, so a missing org is 400)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/fleet/telemetry",
      payload: { vehicleId: "van-2", lat: -37.82, lng: 144.98 },
    });

    expect(response.statusCode).toBe(400);
    expect(publishToOrg).not.toHaveBeenCalled();
  });

  it("rejects a non-technician role (dispatcher is never a field sender)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/fleet/telemetry",
      headers: { authorization: bearer("dispatcher") },
      payload: { vehicleId: "van-2", lat: -37.82, lng: 144.98 },
    });

    expect(response.statusCode).toBe(403);
    expect(publishToOrg).not.toHaveBeenCalled();
  });

  it("rejects invalid coordinates", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/fleet/telemetry",
      headers: { authorization: bearer("technician") },
      payload: { vehicleId: "van-2", lat: -91, lng: 144.98 },
    });

    expect(response.statusCode).toBe(400);
    expect(publishToOrg).not.toHaveBeenCalled();
  });
});
