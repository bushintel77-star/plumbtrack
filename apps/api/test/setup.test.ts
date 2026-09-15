import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    orgSetup: { findUnique: mocks.findUnique, create: mocks.create, update: mocks.update },
    auditEvent: { create: mocks.auditCreate },
  },
}));

import { buildApp } from "../src/server";
import { issueAuthToken, type OrganizationRole } from "../src/lib/auth";

const ORG = "org-setup-test";
const bearer = (role: OrganizationRole) => `Bearer ${issueAuthToken({ userId: "u-owner", organizationId: ORG, role })}`;

function setupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "setup-1",
    orgId: ORG,
    status: "in_progress",
    currentStep: "business",
    completedSteps: [] as string[],
    skippedSteps: [] as string[],
    answers: {},
    startedAt: new Date("2026-09-16T00:00:00.000Z"),
    launchedAt: null,
    launchedBy: null,
    ...overrides,
  };
}

describe("guided setup", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });
  afterAll(async () => app.close());
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(setupRow());
    mocks.create.mockResolvedValue(setupRow());
    mocks.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => setupRow(data));
    mocks.auditCreate.mockResolvedValue({ id: "audit-1" });
    delete process.env.ABR_GUID;
  });

  it("starts a setup record on first read and reports progress", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const response = await app.inject({ method: "GET", url: "/api/setup", headers: { authorization: bearer("owner") } });

    expect(response.statusCode).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith({ data: { orgId: ORG } });
    expect(response.json()).toMatchObject({
      status: "in_progress",
      currentStep: "business",
      canLaunch: false,
      progress: { done: 0, total: 10 },
    });
  });

  it("saves a completed step and moves the operator to the next one", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/setup/step",
      headers: { authorization: bearer("owner") },
      payload: {
        step: "team",
        intent: "complete",
        nextStep: "services",
        answers: { teamSize: "2_5", roles: ["plumbers", "apprentices"], vans: 2 },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { orgId: ORG },
      data: expect.objectContaining({ currentStep: "services", completedSteps: ["team"] }),
    }));
    expect(response.json().answers.team).toMatchObject({ teamSize: "2_5", vans: 2 });
  });

  it("explains which answer needs fixing instead of saving a broken step", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/setup/step",
      headers: { authorization: bearer("owner") },
      payload: { step: "services", intent: "complete", answers: { trades: [] } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ step: "services" });
    expect(response.json().issues[0].message).toMatch(/at least one/i);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("keeps a half-finished step as a draft so nothing is lost on exit", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/setup/step",
      headers: { authorization: bearer("owner") },
      payload: { step: "services", intent: "draft", answers: { trades: [] } },
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ completedSteps: [] }),
    }));
  });

  it("records a skipped step without counting it as done", async () => {
    await app.inject({
      method: "PUT",
      url: "/api/setup/step",
      headers: { authorization: bearer("owner") },
      payload: { step: "comms", intent: "skip", answers: {} },
    });

    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ skippedSteps: ["comms"], completedSteps: [] }),
    }));
  });

  it("won't launch until the required steps are done, and says which are missing", async () => {
    mocks.findUnique.mockResolvedValue(setupRow({ completedSteps: ["business"] }));
    const response = await app.inject({
      method: "POST",
      url: "/api/setup/launch",
      headers: { authorization: bearer("owner") },
      payload: { confirm: true },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().missing).toEqual(["team", "services"]);
  });

  it("launches once the required steps are complete", async () => {
    mocks.findUnique.mockResolvedValue(setupRow({ completedSteps: ["business", "team", "services"] }));
    mocks.update.mockResolvedValue(setupRow({ status: "complete", completedSteps: ["business", "team", "services"], launchedAt: new Date("2026-09-16T02:00:00.000Z") }));

    const response = await app.inject({
      method: "POST",
      url: "/api/setup/launch",
      headers: { authorization: bearer("owner") },
      payload: { confirm: true },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "complete", launchedAt: "2026-09-16T02:00:00.000Z" });
  });

  it("is owner/admin only to change, readable by the office, closed to the field", async () => {
    const write = await app.inject({
      method: "PUT",
      url: "/api/setup/step",
      headers: { authorization: bearer("dispatcher") },
      payload: { step: "team", answers: { teamSize: "just_me" } },
    });
    expect(write.statusCode).toBe(403);

    const read = await app.inject({ method: "GET", url: "/api/setup", headers: { authorization: bearer("dispatcher") } });
    expect(read.statusCode).toBe(200);

    const field = await app.inject({ method: "GET", url: "/api/setup", headers: { authorization: bearer("technician") } });
    expect(field.statusCode).toBe(403);
  });

  it("says plainly when ABN lookup isn't set up rather than failing silently", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/setup/abn/51824753556",
      headers: { authorization: bearer("owner") },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ configured: false });
    expect(response.json().message).toMatch(/type the business name/i);
  });

  it("rejects an ABN that isn't 11 digits before calling the register", async () => {
    process.env.ABR_GUID = "test-guid";
    const response = await app.inject({
      method: "GET",
      url: "/api/setup/abn/123",
      headers: { authorization: bearer("owner") },
    });
    expect(response.statusCode).toBe(400);
  });
});
