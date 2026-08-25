import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const { create, findUnique, updateMany, transaction, createDomainEvent } = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  transaction: vi.fn(),
  createDomainEvent: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    job: { create, findUnique, updateMany, findMany: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn() },
    domainEventOutbox: { create: createDomainEvent },
    $transaction: transaction,
    timeEntry: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    jobPhoto: { create: vi.fn(), deleteMany: vi.fn() },
  },
}));

import { buildApp } from "../src/server";

const ORG = "org_caulfield_south";
const JOB = {
  id: "cuid-job-1",
  orgId: ORG,
  client: "Marlene Cho",
  address: "9 Booran Rd, Caulfield South VIC",
  scope: "Kitchen mixer tap replacement",
  phone: "0412 555 104",
  accessCode: "Gate 1042",
  status: "scheduled",
  timeEntries: [],
  photos: [],
};

describe("residential job contact metadata", () => {
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
    create.mockResolvedValue(JOB);
    findUnique.mockResolvedValue(JOB);
    updateMany.mockResolvedValue({ count: 1 });
    createDomainEvent.mockResolvedValue({});
    transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      job: { findFirst: vi.fn(), findUnique, updateMany },
      domainEventOutbox: { create: createDomainEvent },
    }));
  });

  it("persists phone and access code when creating a job", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers: { "x-organization-id": ORG },
      payload: {
        client: JOB.client,
        address: JOB.address,
        scope: JOB.scope,
        phone: JOB.phone,
        accessCode: JOB.accessCode,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        orgId: ORG,
        phone: JOB.phone,
        accessCode: JOB.accessCode,
      }),
      include: { timeEntries: true, photos: true },
    }));
  });

  it("allows clearing contact metadata on an existing job", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/jobs/cuid-job-1",
      headers: { "x-organization-id": ORG },
      payload: { phone: null, accessCode: null },
    });

    expect(response.statusCode).toBe(200);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "cuid-job-1", orgId: ORG },
      data: { phone: null, accessCode: null },
    }));
  });
});
