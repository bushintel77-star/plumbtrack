import { beforeEach, describe, expect, it, vi } from "vitest"

const apiRequestSpy = vi.hoisted(() => vi.fn())
const toastSpy = vi.hoisted(() => vi.fn())

vi.mock("@/lib/api", () => ({
  apiRequest: apiRequestSpy,
  authApi: {},
  persistJobStatus: vi.fn()
}))
vi.mock("@/hooks/use-toast", () => ({ toast: toastSpy }))
vi.mock("@/lib/offline", () => ({ enqueueSync: vi.fn() }))

import { performMarkApproved, performMarkSent } from "@/features/board/actions"
import { adaptApiBoard, type ApiBoardPayload, type ApiJob } from "@/lib/adapter"
import { useBoardStore, type LiveLocation } from "@/stores/boardStore"
import type { Job, Technician } from "@/types"

const techs: Technician[] = [
  { id: "t-mike", name: "Mike Reyes", van: "Van 2", skills: ["general"], role: "Technician", absences: [] }
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

function boardJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "j-1",
    client: "Alice",
    address: "1 Main St",
    title: "Fix leak",
    scope: "Fix leak",
    status: "scheduled",
    priority: "standard",
    techId: null,
    startBlock: 0,
    spanBlocks: 2,
    elapsedSeconds: 0,
    timerRunning: false,
    quote: {
      id: "q-1",
      clientName: "Alice",
      lineItems: [{ id: "li-1", description: "Labour", qty: 1, unitPrice: 120 }],
      status: "draft",
      total: 120
    },
    timeEntries: [],
    photos: [],
    messages: [],
    documents: [],
    ...overrides
  } as Job
}

const ping = (vehicleId: string, presence: LiveLocation["presence"]): LiveLocation => ({
  vehicleId,
  lat: -37.8,
  lng: 145.0,
  heading: 90,
  speed: 10,
  presence,
  timestamp: Date.now()
})

describe("adaptApiBoard — quoteId linkage", () => {
  it("prefers the server-linked quote over the legacy client-name match", () => {
    const payload: ApiBoardPayload = {
      jobs: [apiJob({ quoteId: "q-real" })],
      quotes: [
        { id: "q-name-match", client: "Alice", status: "draft", lines: [] },
        { id: "q-real", client: "Someone Else", status: "sent", lines: [{ id: "l1", description: "Tap", quantity: 1, unitPrice: 90 }] }
      ]
    }

    const { jobs } = adaptApiBoard(payload, techs)

    expect(jobs["J-1"].quote.id).toBe("q-real")
    expect(jobs["J-1"].quote.status).toBe("sent")
  })

  it("falls back to the client-name match when the job carries no quoteId", () => {
    const payload: ApiBoardPayload = {
      jobs: [apiJob()],
      quotes: [{ id: "q-legacy", client: "Alice", status: "draft", lines: [] }]
    }

    const { jobs } = adaptApiBoard(payload, techs)

    expect(jobs["J-1"].quote.id).toBe("q-legacy")
  })
})

describe("boardStore — off_shift telemetry", () => {
  beforeEach(() => {
    useBoardStore.setState({ liveLocations: {}, liveLocationHistory: {} })
  })

  it("an off_shift ping drops the vehicle marker instead of plotting it", () => {
    const store = useBoardStore.getState()
    store.mergeLiveLocations([ping("veh-1", "on_job")])
    expect(useBoardStore.getState().liveLocations["veh-1"]).toBeDefined()

    store.mergeLiveLocations([ping("veh-1", "off_shift")])

    expect(useBoardStore.getState().liveLocations["veh-1"]).toBeUndefined()
  })

  it("clearLiveLocation removes an existing marker", () => {
    const store = useBoardStore.getState()
    store.mergeLiveLocations([ping("veh-2", "on_break")])
    expect(useBoardStore.getState().liveLocations["veh-2"]).toBeDefined()

    store.clearLiveLocation("veh-2")

    expect(useBoardStore.getState().liveLocations["veh-2"]).toBeUndefined()
  })
})

describe("quote lifecycle actions — real API persistence", () => {
  beforeEach(() => {
    apiRequestSpy.mockReset()
    toastSpy.mockReset()
    useBoardStore.setState({ jobs: { "j-1": boardJob() }, dataMode: "live", offline: false })
  })

  it("mark sent PATCHes /api/quotes/:id with status sent", async () => {
    apiRequestSpy.mockResolvedValue({})

    await performMarkSent("j-1")

    expect(apiRequestSpy).toHaveBeenCalledWith("/api/quotes/q-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "sent" })
    })
    expect(useBoardStore.getState().jobs["j-1"].quote.status).toBe("sent")
  })

  it("mark approved PATCHes status accepted on a SENT quote", async () => {
    useBoardStore.setState({
      jobs: { "j-1": boardJob({ quote: { ...boardJob().quote, status: "sent" } }) }
    })
    apiRequestSpy.mockResolvedValue({})

    await performMarkApproved("j-1")

    expect(apiRequestSpy).toHaveBeenCalledWith("/api/quotes/q-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "accepted" })
    })
    expect(useBoardStore.getState().jobs["j-1"].quote.status).toBe("approved")
  })

  it("rolls the local transition back when the API write fails", async () => {
    apiRequestSpy.mockRejectedValue(new Error("offline"))

    await performMarkSent("j-1")

    expect(useBoardStore.getState().jobs["j-1"].quote.status).toBe("draft")
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }))
  })

  it("skips the API call entirely when the job has no linked quote record", async () => {
    useBoardStore.setState({
      jobs: { "j-1": boardJob({ quote: { ...boardJob().quote, id: undefined } }) }
    })

    await performMarkSent("j-1")

    expect(apiRequestSpy).not.toHaveBeenCalled()
    expect(useBoardStore.getState().jobs["j-1"].quote.status).toBe("sent")
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringContaining("Saved locally only") })
    )
  })
})
