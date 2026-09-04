import { beforeEach, describe, expect, it, vi } from "vitest"

const { openDB } = vi.hoisted(() => ({ openDB: vi.fn() }))

vi.mock("idb", () => ({ openDB }))

function op(overrides: Partial<SyncOp> & { op: SyncOp["op"] }): SyncOp {
  return { id: 1, jobId: "J-1", queuedAt: 1_000, payload: {}, ...overrides }
}

type SyncOp = { id?: number; jobId: string; op: "assign" | "status"; queuedAt: number; payload: Record<string, unknown> }

/** offline.ts refuses to run without a browser global and caches its db
 *  promise at module scope — import it fresh per test with `window` present. */
async function freshOfflineModule() {
  vi.resetModules()
  vi.stubGlobal("window", {})
  const mod = await import("@/lib/offline")
  return mod
}

describe("drainSyncQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it("hands the whole op to the persist callback so assign ops keep their payload", async () => {
    // Regression guard: the drain used to pass (jobId, payload) and the
    // consumer funnelled everything through the status PATCH — assign ops
    // lost their {techId, startBlock} payload as an empty body.
    const assign = op({ id: 1, op: "assign", queuedAt: 1_000, payload: { techId: "cm000-1", startBlock: 4 } })
    const status = op({ id: 2, op: "status", queuedAt: 2_000, payload: { status: "completed" } })
    const removed: number[] = []
    openDB.mockResolvedValue({
      getAll: vi.fn().mockResolvedValue([status, assign]), // out of order on purpose
      delete: vi.fn().mockImplementation(async (_store: string, id: number) => {
        removed.push(id)
      })
    })

    const { drainSyncQueue } = await freshOfflineModule()
    const seen: SyncOp[] = []
    const drained = await drainSyncQueue(async next => {
      seen.push(next as SyncOp)
    })

    expect(drained).toBe(2)
    // FIFO by queuedAt, and each op arrives with its kind intact.
    expect(seen.map(o => o.op)).toEqual(["assign", "status"])
    expect(seen[0].payload).toEqual({ techId: "cm000-1", startBlock: 4 })
    expect(removed).toEqual([1, 2])
  })

  it("stops at the first failing op and leaves it queued", async () => {
    const first = op({ id: 1, op: "status", queuedAt: 1_000, payload: { status: "in_progress" } })
    const second = op({ id: 2, op: "status", queuedAt: 2_000, payload: { status: "completed" } })
    openDB.mockResolvedValue({
      getAll: vi.fn().mockResolvedValue([first, second]),
      delete: vi.fn()
    })

    const { drainSyncQueue } = await freshOfflineModule()
    const drained = await drainSyncQueue(async () => {
      throw new Error("still offline")
    })

    expect(drained).toBe(0)
  })
})
