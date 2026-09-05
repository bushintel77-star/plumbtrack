import { describe, expect, it } from "vitest"

import { buildVroomRequest, mapVroomSolution } from "@/lib/fleetOptimize"
import type { Job, Technician } from "@/types"

const DAY = "2026-09-07"

const tech: Technician = {
  id: "t-1",
  name: "Dana Whitfield",
  van: "Van 1",
  skills: ["drainage"],
  role: "Technician",
  absences: []
}

const job = (overrides: Partial<Job> & { id: string }): Job => ({
  id: overrides.id,
  client: "Client",
  address: "1 Test St",
  scope: "Fix",
  priority: "normal",
  techId: null,
  startBlock: 0,
  spanBlocks: 2,
  scheduledDate: DAY,
  status: "unassigned",
  requiredSkill: null,
  signature: null,
  timeEntries: [],
  photos: [],
  documents: [],
  location: { lat: -37.8, lng: 144.96 },
  elapsedSeconds: 0,
  timerRunning: false,
  clockOnCount: 0,
  quote: { clientName: "Client", lineItems: null, status: "draft" },
  logEntries: [],
  dailyReports: [],
  checklists: [],
  milestones: [],
  ...overrides
})

const config = { scope: "unassigned" as const, maxRoutes: 2, maxTasksPerRoute: 8, maxHoursPerRoute: 8 }

describe("buildVroomRequest", () => {
  it("registers skills as stable numeric ids and gates solvable jobs on coordinates", () => {
    const located = job({ id: "j-ok", requiredSkill: "drainage" })
    const nowhere = job({ id: "j-lost", requiredSkill: "drainage", location: null })
    const { request, solvableJobIds, registry } = buildVroomRequest(DAY, [located, nowhere], [tech], config)

    expect(registry).toEqual(["drainage"])
    expect(request.jobs).toHaveLength(1)
    expect(request.jobs[0].skills).toEqual([1])
    expect(request.vehicles[0].skills).toEqual([1])
    expect(request.vehicles[0].time_window?.[0]).toBe(8 * 3600)
    expect(solvableJobIds.has("j-ok")).toBe(true)
    expect(solvableJobIds.has("j-lost")).toBe(false)
  })
})

describe("mapVroomSolution", () => {
  const located = job({ id: "j-1", title: "Burst pipe", techId: null })

  it("maps arrival seconds onto board blocks and reports unplaced jobs honestly", () => {
    // 09:00 arrival (one hour into the shift) at the job's coordinates.
    const solution = {
      routes: [
        { vehicle_id: "t-1", steps: [{ type: "start" as const }, { type: "job" as const, job: "j-1", arrival: 9 * 3600 }] }
      ]
    }
    const result = mapVroomSolution(solution, DAY, [located], [tech], config)

    expect(result.routes).toHaveLength(1)
    expect(result.routes[0].stops[0]).toMatchObject({ jobId: "j-1", startBlock: 2 })
    expect(result.unplaced).toHaveLength(0)
  })

  it("keeps the local engine's apply semantics: existing jobs are not isNew", () => {
    const own = job({ id: "j-2", techId: "t-1", status: "scheduled" })
    const solution = {
      routes: [{ vehicle_id: "t-1", steps: [{ type: "job" as const, job: "j-2", arrival: 8 * 3600 }] }]
    }
    const result = mapVroomSolution(solution, DAY, [own], [tech], config)
    expect(result.routes[0].stops[0].isNew).toBe(false)
  })

  it("reports a solvable-but-unplaced job with an actionable reason", () => {
    const solution = { routes: [] }
    const result = mapVroomSolution(solution, DAY, [located], [tech], config)
    expect(result.unplaced).toHaveLength(1)
    expect(result.unplaced[0].reason).toMatch(/could not place/i)
  })
})
