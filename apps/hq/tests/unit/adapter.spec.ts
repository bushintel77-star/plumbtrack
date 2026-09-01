import { describe, expect, it } from "vitest"

import { adaptApiBoard, type ApiBoardPayload, type ApiJob } from "@/lib/adapter"
import type { Technician } from "@/types"

const techs: Technician[] = [
  { id: "t-mike", name: "Mike Reyes", van: "Van 2", skills: ["gas", "hot-water", "general"], role: "Technician", absences: [] },
  { id: "t-dana", name: "Dana Whitfield", van: "Van 1", skills: ["drainage", "general"], role: "Electrician", absences: [] }
]

function apiJob(overrides: Partial<ApiJob> = {}): ApiJob {
  return {
    id: "J-1",
    client: "Alice",
    address: "1 Main St",
    scope: "Fix leak",
    status: "scheduled",
    createdAt: "2026-01-01T00:00:00.000Z",
    timeEntries: [],
    ...overrides
  }
}

describe("adaptApiBoard — server-authoritative assignment", () => {
  it("uses the appointment's assigned tech id and its schedule", () => {
    const payload: ApiBoardPayload = {
      jobs: [
        apiJob({
          appointment: {
            id: "ap-1",
            assignedStaffId: "t-dana",
            assignedStaffName: "Dana Whitfield",
            scheduledStart: "2026-01-02T09:00:00.000Z",
            scheduledEnd: "2026-01-02T10:30:00.000Z",
            status: "assigned"
          }
        })
      ],
      quotes: []
    }

    const { jobs } = adaptApiBoard(payload, techs)
    const job = jobs["J-1"]

    expect(job.techId).toBe("t-dana")
    expect(job.startBlock).toBe(2) // 09:00 → block 2
    expect(job.spanBlocks).toBe(3) // 09:00–10:30
    expect(job.scheduledDate).toBe("2026-01-02")
  })

  it("falls back to a name match when the staff id is not a board technician", () => {
    const payload: ApiBoardPayload = {
      jobs: [
        apiJob({
          appointment: {
            id: "ap-1",
            assignedStaffId: "cm000-unknown",
            assignedStaffName: "Mike Reyes",
            scheduledStart: "2026-01-02T08:00:00.000Z",
            scheduledEnd: "2026-01-02T08:30:00.000Z",
            status: "assigned"
          }
        })
      ],
      quotes: []
    }

    const { jobs } = adaptApiBoard(payload, techs)
    const job = jobs["J-1"]

    expect(job.techId).toBe("t-mike")
    expect(job.startBlock).toBe(0) // 08:00 → block 0
  })

  it("keeps round-robin techs and pseudo slots when the job has no appointment", () => {
    const payload: ApiBoardPayload = {
      jobs: [apiJob(), apiJob({ id: "J-2", address: "2 Side St" })],
      quotes: []
    }

    const { jobs } = adaptApiBoard(payload, techs)

    expect(jobs["J-1"].techId).toBe("t-mike") // index 0 round-robin
    expect(jobs["J-2"].techId).toBe("t-dana") // index 1 round-robin
  })

  it("takes the appointment schedule but round-robins the tech when unassigned", () => {
    const payload: ApiBoardPayload = {
      jobs: [
        apiJob({
          appointment: {
            id: "ap-1",
            assignedStaffId: null,
            assignedStaffName: null,
            scheduledStart: "2026-01-03T11:00:00.000Z",
            scheduledEnd: "2026-01-03T11:30:00.000Z",
            status: "assigned"
          }
        })
      ],
      quotes: []
    }

    const { jobs } = adaptApiBoard(payload, techs)
    const job = jobs["J-1"]

    expect(job.techId).toBe("t-mike") // fallback round-robin
    expect(job.startBlock).toBe(6) // 11:00 → block 6
    expect(job.scheduledDate).toBe("2026-01-03")
  })
})
