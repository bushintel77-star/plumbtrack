import { describe, expect, it, vi } from "vitest"

import { applyLiveFrame, getFieldState, setLiveConnection } from "@/state/store"
import type { Job, LiveFrame } from "@/types"

// Native storage never loads in node — the store pulls AsyncStorage via the
// outbox mirror only, and auth stays out of these frame tests.
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined }
}))
vi.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined
}))
vi.mock("expo-haptics", () => ({
  impactAsync: async () => undefined,
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" }
}))
// The WatermelonDB layer imports react-native adapters — never loads in
// node; the frame tests exercise the store, not the cache.
vi.mock("@/db/sync", () => ({
  cacheJobs: async () => undefined,
  readCachedJobs: async () => [],
  syncJobs: async () => undefined,
  jobToRaw: (job: unknown) => job
}))

/** Seed the board through the same live path — env-independent fixtures. */
function seedJob(job: Pick<Job, "id" | "status"> & Partial<Job>): void {
  applyLiveFrame({
    topic: "topic/jobs/created",
    job: {
      client: `Client ${job.id}`,
      address: "1 Test St",
      scope: "Seeded job",
      timeEntries: [],
      photos: [],
      ...job
    } as Job
  })
}

describe("live frame application (board store)", () => {
  it("job.created appends a job exactly once", () => {
    const before = getFieldState().jobs.length
    const created: LiveFrame = {
      topic: "topic/jobs/created",
      job: {
        id: "j-live-1",
        client: "Petrov",
        address: "31 Hawthorn Rd",
        scope: "New streamed job",
        status: "scheduled",
        timeEntries: [],
        photos: []
      }
    }
    applyLiveFrame(created)
    applyLiveFrame(created) // duplicate delivery must not duplicate the job
    expect(getFieldState().jobs).toHaveLength(before + 1)
    expect(getFieldState().jobs.some(job => job.id === "j-live-1")).toBe(true)
  })

  it("job.status patches the status without touching other jobs", () => {
    seedJob({ id: "j-2001", status: "in_progress" })
    seedJob({ id: "j-2002", status: "scheduled" })

    applyLiveFrame({ topic: "topic/jobs/status", jobId: "j-2002", status: "in_progress" })
    expect(getFieldState().jobs.find(item => item.id === "j-2002")?.status).toBe("in_progress")
    expect(getFieldState().jobs.find(item => item.id === "j-2001")?.status).toBe("in_progress") // untouched
  })

  it("job.updated merges a partial patch (the demo simulator's scope update)", () => {
    seedJob({ id: "j-2002", status: "scheduled", scope: "Hot water unit service" })

    applyLiveFrame({
      topic: "topic/jobs/updated",
      jobId: "j-2002",
      patch: { scope: "Hot water unit service — tempering valve + relief valve replacement" }
    })
    expect(getFieldState().jobs.find(item => item.id === "j-2002")?.scope).toContain("relief valve")
  })

  it("activity clock-in opens a remote entry; clock-out closes it", () => {
    seedJob({ id: "j-2002", status: "scheduled" })

    applyLiveFrame({ topic: "topic/jobs/activity", jobId: "j-2002", activity: "clock-in", entryId: "te-remote" })
    let job = getFieldState().jobs.find(item => item.id === "j-2002")
    expect(job?.timeEntries.some(entry => entry.id === "te-remote" && entry.end === null)).toBe(true)

    applyLiveFrame({ topic: "topic/jobs/activity", jobId: "j-2002", activity: "clock-out", entryId: "te-remote" })
    job = getFieldState().jobs.find(item => item.id === "j-2002")
    expect(job?.timeEntries.every(entry => entry.end !== null)).toBe(true)
  })

  it("stream control frames and unknown topics are ignored", () => {
    const before = JSON.stringify(getFieldState().jobs)
    applyLiveFrame({ topic: "topic/stream/hello", orgId: "org" })
    applyLiveFrame({ topic: "topic/stream/ping" })
    expect(JSON.stringify(getFieldState().jobs)).toBe(before)
  })

  it("live connection state transitions update the store", () => {
    setLiveConnection("live")
    expect(getFieldState().live).toBe("live")
    setLiveConnection("offline")
    expect(getFieldState().live).toBe("offline")
  })
})
