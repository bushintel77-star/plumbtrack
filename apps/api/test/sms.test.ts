import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const { jobFindFirst, orgFindUnique, smsMessageFindFirst, smsMessageCreate } = vi.hoisted(() => ({
  jobFindFirst: vi.fn(),
  orgFindUnique: vi.fn(),
  smsMessageFindFirst: vi.fn(),
  smsMessageCreate: vi.fn(),
}));
vi.mock("@plumbtrack/database", () => ({
  prisma: {
    job: { findFirst: jobFindFirst },
    organization: { findUnique: orgFindUnique },
    smsMessage: { findFirst: smsMessageFindFirst, create: smsMessageCreate },
  },
}));

import { buildApp } from "../src/server";
import { issueAuthToken, type OrganizationRole } from "../src/lib/auth";

const ORG = "org-sms-test";
function bearer(role: OrganizationRole): string {
  return `Bearer ${issueAuthToken({ userId: "user-1", organizationId: ORG, role })}`;
}

describe("POST /api/sms/eta", () => {
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
    jobFindFirst.mockResolvedValue({ id: "job-1", orgId: ORG, phone: "+61412345678" });
    orgFindUnique.mockResolvedValue({ name: "Test Plumbing Co" });
    smsMessageFindFirst.mockResolvedValue(null);
    smsMessageCreate.mockResolvedValue({ id: "sms-1" });
  });

  it("returns test mode (202) when Twilio is not configured", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/sms/eta",
      headers: { authorization: bearer("dispatcher") },
      payload: { jobId: "job-1", etaMinutes: 15 },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ sent: false, mode: "test" });
  });

  it("returns 409 when the job has no customer phone", async () => {
    jobFindFirst.mockResolvedValue({ id: "job-1", orgId: ORG, phone: null });
    const response = await app.inject({
      method: "POST",
      url: "/api/sms/eta",
      headers: { authorization: bearer("dispatcher") },
      payload: { jobId: "job-1", etaMinutes: 15 },
    });
    expect(response.statusCode).toBe(409);
  });

  it("rejects a technician role (dispatch-only action)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/sms/eta",
      headers: { authorization: bearer("technician") },
      payload: { jobId: "job-1", etaMinutes: 15 },
    });
    expect(response.statusCode).toBe(403);
  });

  it("records the send outcome with the outbox opId", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/sms/eta",
      headers: { authorization: bearer("dispatcher") },
      payload: { jobId: "job-1", etaMinutes: 15, opId: "sms-op-1" },
    });

    expect(response.statusCode).toBe(202);
    expect(smsMessageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: ORG,
        jobId: "job-1",
        opId: "sms-op-1",
        status: "provider_unconfigured",
      }),
    });
  });

  it("dedupes a retried opId — returns the recorded outcome without re-sending", async () => {
    smsMessageFindFirst.mockResolvedValue({
      id: "sms-1",
      status: "sent",
      providerMessageId: "SM123",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/sms/eta",
      headers: { authorization: bearer("dispatcher") },
      payload: { jobId: "job-1", etaMinutes: 15, opId: "sms-op-1" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ sent: true, mode: "live", providerMessageId: "SM123", duplicate: true });
    expect(smsMessageCreate).not.toHaveBeenCalled();
  });
});
