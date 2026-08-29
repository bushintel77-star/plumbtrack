import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const publishSpy = vi.fn()
vi.mock("../src/lib/liveBus", () => ({
  publishToOrg: (...args: unknown[]) => publishSpy(...args),
  subscribeOrg: vi.fn(() => () => {}),
  clearLiveBus: vi.fn()
}))

const prismaMock = vi.hoisted(() => ({
  job: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn()
  },
  timeEntry: {
    create: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn()
  },
  checklistTemplate: { findFirst: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(1), create: vi.fn() },
  checklistItem: { findFirst: vi.fn(), update: vi.fn(), createMany: vi.fn().mockResolvedValue({ count: 0 }) },
  appointment: { updateMany: vi.fn() },
  domainEventOutbox: { create: vi.fn() },
  $transaction: vi.fn()
}))

vi.mock("@plumbtrack/database", () => ({ prisma: prismaMock }))

import { buildApp } from "../src/server"
import type { FastifyInstance } from "fastify"

const ORG = "org_test"
const JOB = { id: "j-1", orgId: ORG, client: "Harrington", status: "scheduled", timeEntries: [], photos: [] }

describe("job routes publish live frames", () => {
  let app: FastifyInstance

  beforeEach(async () => {
    publishSpy.mockClear()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it("job creation publishes a jobs/created frame to the org channel", async () => {
    prismaMock.job.create.mockResolvedValue(JOB)

    const res = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers: { "x-organization-id": ORG },
      payload: { client: "Harrington", address: "14 Kooyong Rd", scope: "Burst tap" }
    })

    expect(res.statusCode).toBe(201)
    expect(publishSpy).toHaveBeenCalledWith(
      expect.objectContaining({ topic: "topic/jobs/created", orgId: ORG })
    )
  })

  it("status update publishes a jobs/status frame with the new status", async () => {
    prismaMock.job.findFirst.mockResolvedValue(JOB)
    prismaMock.job.updateMany.mockResolvedValue({ count: 1 })
    prismaMock.job.findUnique.mockResolvedValue({ ...JOB, status: "in_progress" })
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ job: prismaMock.job, domainEventOutbox: prismaMock.domainEventOutbox })
    )

    const res = await app.inject({
      method: "PATCH",
      url: "/api/jobs/j-1",
      headers: { "x-organization-id": ORG },
      payload: { status: "in_progress" }
    })

    expect(res.statusCode).toBe(200)
    expect(publishSpy).toHaveBeenCalledWith(
      expect.objectContaining({ topic: "topic/jobs/status", orgId: ORG, jobId: "j-1", status: "in_progress" })
    )
  })

  it("clock-in publishes a jobs/activity frame", async () => {
    prismaMock.job.findFirst.mockResolvedValue(JOB)
    prismaMock.timeEntry.findFirst.mockResolvedValue(null)
    prismaMock.timeEntry.create.mockResolvedValue({ id: "te-1", jobId: "j-1", end: null })

    const res = await app.inject({
      method: "POST",
      url: "/api/jobs/j-1/time-entries",
      headers: { "x-organization-id": ORG },
      payload: { staffId: "s-1", opId: "op-1", start: new Date().toISOString(), lat: null, lng: null }
    })

    expect(res.statusCode).toBe(201)
    expect(publishSpy).toHaveBeenCalledWith(
      expect.objectContaining({ topic: "topic/jobs/activity", orgId: ORG, jobId: "j-1", activity: "clock-in" })
    )
  })
})
