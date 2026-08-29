import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const prismaMock = vi.hoisted(() => ({
  job: {
    findMany: vi.fn()
  }
}))

vi.mock("@plumbtrack/database", () => ({ prisma: prismaMock }))

import { buildApp } from "../src/server"
import type { FastifyInstance } from "fastify"

const ORG = "org_test"
const NOW = new Date("2026-08-29T06:00:00.000Z")

const JOB = (id: string, updatedMinutesAgo: number) => ({
  id,
  orgId: ORG,
  client: `Client ${id}`,
  address: "1 Sync St",
  scope: "Synced scope",
  phone: null,
  accessCode: null,
  jobType: "blocked_drain",
  status: "scheduled",
  timeEntries: [
    { id: `te-${id}`, staffId: "s-1", start: NOW, end: null, lat: null, lng: null }
  ],
  createdAt: new Date(NOW.getTime() - 3_600_000),
  updatedAt: new Date(NOW.getTime() - updatedMinutesAgo * 60_000)
})

describe("GET /api/sync (WatermelonDB pull contract)", () => {
  let app: FastifyInstance

  beforeEach(async () => {
    prismaMock.job.findMany.mockReset()
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it("first pull ships every org job as created with epoch-ms stamps", async () => {
    prismaMock.job.findMany.mockResolvedValue([JOB("j-1", 30), JOB("j-2", 10)])

    const res = await app.inject({
      method: "GET",
      url: "/api/sync",
      headers: { "x-organization-id": ORG }
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    const created = body.changes.jobs.created
    expect(created).toHaveLength(2)
    expect(body.changes.jobs.updated).toHaveLength(0)
    expect(body.changes.jobs.deleted).toHaveLength(0)
    expect(created[0]).toMatchObject({
      id: "j-1",
      access_code: null,
      job_type: "blocked_drain",
      time_entries: [{ id: "te-j-1", end: null }]
    })
    expect(typeof body.timestamp).toBe("number")
    expect(created[0].updated_at).toBeGreaterThan(created[0].created_at - 1)
    // org-scoped query
    expect(prismaMock.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: ORG }) })
    )
  })

  it("incremental pull filters by the cursor and ships as updated", async () => {
    prismaMock.job.findMany.mockResolvedValue([JOB("j-2", 5)])

    const cursorSeconds = Math.floor((NOW.getTime() - 60_000) / 1000)
    const res = await app.inject({
      method: "GET",
      url: `/api/sync?last_pulled_at=${cursorSeconds}`,
      headers: { "x-organization-id": ORG }
    })

    const body = res.json()
    expect(body.changes.jobs.created).toHaveLength(0)
    expect(body.changes.jobs.updated).toHaveLength(1)
    expect(body.changes.jobs.updated[0].id).toBe("j-2")
    // Cursor filter passed through to the (parameterised) Prisma query
    expect(prismaMock.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ orgId: ORG, updatedAt: { gt: new Date(cursorSeconds * 1000) } })
      })
    )
  })

  it("requires an org context", async () => {
    const res = await app.inject({ method: "GET", url: "/api/sync" })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
  })
})
