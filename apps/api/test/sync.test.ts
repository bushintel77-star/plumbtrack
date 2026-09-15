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
      assigned_staff_id: null,
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

  it("ships the server-authoritative assignee from the earliest appointment", async () => {
    const assigned = { ...JOB("j-3", 2), appointments: [{ assignedStaffId: "staff-7" }] }
    prismaMock.job.findMany.mockResolvedValue([assigned])

    const res = await app.inject({ method: "GET", url: "/api/sync", headers: { "x-organization-id": ORG } })
    const created = res.json().changes.jobs.created

    expect(created[0].assigned_staff_id).toBe("staff-7")
  })

  it("ships geocoded coordinates, arrival/departure marks, and photos", async () => {
    // The field app's map pins, navigate link, and evidence strip all read
    // these columns — they used to be dropped at the API boundary.
    const geocoded = {
      ...JOB("j-4", 5),
      lat: -37.885,
      lng: 145.023,
      arrivedAt: new Date("2026-08-29T00:30:00.000Z"),
      departedAt: null,
      photos: [
        { id: "ph-1", label: "Before", url: "/api/media/ph-1/file", takenAt: new Date("2026-08-29T00:20:00.000Z") },
      ],
    }
    prismaMock.job.findMany.mockResolvedValue([geocoded])

    const res = await app.inject({ method: "GET", url: "/api/sync", headers: { "x-organization-id": ORG } })
    const created = res.json().changes.jobs.created

    expect(created[0]).toMatchObject({
      lat: -37.885,
      lng: 145.023,
      arrived_at: "2026-08-29T00:30:00.000Z",
      departed_at: null,
      photos: [{ id: "ph-1", label: "Before", url: "/api/media/ph-1/file", taken_at: "2026-08-29T00:20:00.000Z" }],
    })
  })

  it("ships nulls for jobs that have not geocoded or been arrived at", async () => {
    prismaMock.job.findMany.mockResolvedValue([{ ...JOB("j-5", 1), lat: null, lng: null, arrivedAt: null, departedAt: null, photos: [] }])

    const res = await app.inject({ method: "GET", url: "/api/sync", headers: { "x-organization-id": ORG } })
    const created = res.json().changes.jobs.created

    expect(created[0]).toMatchObject({ lat: null, lng: null, arrived_at: null, departed_at: null, photos: [] })
  })

  it("ships the CRM link and the customer's next-due agreement", async () => {
    const agreement = { id: "sa-1", serviceType: "Hot water system service", frequency: "12 months", nextDueDate: new Date("2027-08-29T00:00:00.000Z") }
    prismaMock.job.findMany.mockResolvedValue([
      { ...JOB("j-6", 1), scope: "Hot water system service — anode + PRV", customerId: "cus-1", customer: { serviceAgreements: [agreement] } },
      { ...JOB("j-7", 1), scope: "Leaking tap", customerId: "cus-1", customer: { serviceAgreements: [agreement] } },
      { ...JOB("j-8", 1), customerId: null, customer: null },
    ])

    const res = await app.inject({ method: "GET", url: "/api/sync", headers: { "x-organization-id": ORG } })
    const [fulfils, separate, walkIn] = res.json().changes.jobs.created

    expect(fulfils).toMatchObject({
      customer_id: "cus-1",
      agreement: { id: "sa-1", service_type: "Hot water system service", frequency: "12 months", next_due_date: "2027-08-29", fulfills_this_job: true },
    })
    // A different job for the same customer: the agreement is shown, but the
    // data can't say whether this visit is it — no claim either way.
    expect(separate.agreement).toMatchObject({ id: "sa-1", fulfills_this_job: null })
    expect(walkIn).toMatchObject({ customer_id: null, agreement: null })
    expect(prismaMock.job.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        customer: expect.objectContaining({
          select: { serviceAgreements: expect.objectContaining({ where: { active: true }, take: 1 }) },
        }),
      }),
    }))
  })

  it("requires an org context", async () => {
    const res = await app.inject({ method: "GET", url: "/api/sync" })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
  })
})
