import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const prismaMock = vi.hoisted(() => ({
  job: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
  checklistTemplate: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
  checklistItem: { findFirst: vi.fn(), update: vi.fn(), createMany: vi.fn() },
  timeEntry: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  appointment: { updateMany: vi.fn() },
  domainEventOutbox: { create: vi.fn() },
  $transaction: vi.fn()
}))

vi.mock("@plumbtrack/database", () => ({ prisma: prismaMock }))
vi.mock("../src/lib/liveBus", () => ({
  publishToOrg: vi.fn(),
  subscribeOrg: vi.fn(() => () => {}),
  clearLiveBus: vi.fn()
}))

import { buildApp } from "../src/server"
import { instantiateChecklist } from "../src/lib/checklists"
import type { FastifyInstance } from "fastify"

const ORG = "org_test"

describe("checklist instantiation (scope chain)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("builds the list from the jobType template, falling back to the org default", async () => {
    prismaMock.checklistTemplate.findFirst.mockResolvedValue({
      items: [{ label: "Isolate gas supply", sortOrder: 0 }, { label: "Reinstate and test", sortOrder: 1 }]
    })
    prismaMock.checklistItem.createMany.mockResolvedValue({ count: 2 })

    const count = await instantiateChecklist({ jobId: "j-1", orgId: ORG, jobType: "hot_water", quotedLines: [] })
    expect(count).toBe(2)
    expect(prismaMock.checklistItem.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ label: "Isolate gas supply", sortOrder: 0, orgId: ORG, jobId: "j-1" })
        ])
      })
    )
  })

  it("appends quoted-line scope items AFTER the template — the quote is the scope source", async () => {
    prismaMock.checklistTemplate.findFirst.mockResolvedValue({
      items: [{ label: "Confirm site access", sortOrder: 0 }]
    })

    await instantiateChecklist({
      jobId: "j-2",
      orgId: ORG,
      jobType: null,
      quotedLines: ["Replace mixer tap (quoted)", "Camera inspection (quoted)"]
    })

    expect(prismaMock.checklistItem.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ label: "Confirm site access", sortOrder: 0 }),
          expect.objectContaining({ label: "Replace mixer tap (quoted)", sortOrder: 1 }),
          expect.objectContaining({ label: "Camera inspection (quoted)", sortOrder: 2 })
        ])
      })
    )
    const call = prismaMock.checklistItem.createMany.mock.calls[0][0] as { data: unknown[] }
    expect(call.data).toHaveLength(3)
  })

  it("with no template and no quoted lines, the checklist is empty (section renders conditionally)", async () => {
    prismaMock.checklistTemplate.findFirst.mockResolvedValue(null)
    const count = await instantiateChecklist({ jobId: "j-3", orgId: ORG, jobType: null, quotedLines: [] })
    expect(count).toBe(0)
    expect(prismaMock.checklistItem.createMany).not.toHaveBeenCalled()
  })
})

describe("PATCH /api/jobs/:id/checklist-items/:itemId (completion write path)", () => {
  let app: FastifyInstance

  beforeEach(async () => {
    vi.clearAllMocks()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it("completes an item scoped to the authorized job and publishes a live frame", async () => {
    prismaMock.checklistItem.findFirst.mockResolvedValue({
      id: "chk-1",
      jobId: "j-1",
      label: "Isolate water supply",
      completedAt: null
    })
    prismaMock.checklistItem.update.mockResolvedValue({
      id: "chk-1",
      completedAt: new Date("2026-08-29T06:00:00Z")
    })

    const res = await app.inject({
      method: "PATCH",
      url: "/api/jobs/j-1/checklist-items/chk-1",
      headers: { "x-organization-id": ORG },
      payload: { completed: true }
    })

    expect(res.statusCode).toBe(200)
    expect(prismaMock.checklistItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "chk-1", jobId: "j-1", orgId: ORG } })
    )
    const { publishToOrg } = await import("../src/lib/liveBus")
    expect(publishToOrg).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "topic/jobs/checklist",
        jobId: "j-1",
        itemId: "chk-1",
        completedAt: expect.any(String)
      })
    )
  })

  it("rejects a guessed item id from another job (404, not silent success)", async () => {
    prismaMock.checklistItem.findFirst.mockResolvedValue(null)
    const res = await app.inject({
      method: "PATCH",
      url: "/api/jobs/j-1/checklist-items/chk-other",
      headers: { "x-organization-id": ORG },
      payload: { completed: true }
    })
    expect(res.statusCode).toBe(404)
  })

  it("is idempotent on repeat completion — preserves the first completedAt", async () => {
    const firstAt = new Date("2026-08-29T05:00:00Z")
    prismaMock.checklistItem.findFirst.mockResolvedValue({ id: "chk-1", jobId: "j-1", label: "X", completedAt: firstAt })
    prismaMock.checklistItem.update.mockResolvedValue({ id: "chk-1", completedAt: firstAt })

    const res = await app.inject({
      method: "PATCH",
      url: "/api/jobs/j-1/checklist-items/chk-1",
      headers: { "x-organization-id": ORG },
      payload: { completed: true, completedAt: "2026-08-29T09:00:00.000Z" }
    })

    expect(res.statusCode).toBe(200)
    // The update must preserve the ORIGINAL completion, not the retry's timestamp
    expect(prismaMock.checklistItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ completedAt: firstAt }) })
    )
  })
})
