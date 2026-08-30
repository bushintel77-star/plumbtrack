import { beforeEach, describe, expect, it } from "vitest"

import { useFailedOps } from "@/features/fieldloop/failedOps"

const move = {
  jobId: "j1",
  jobTitle: "Backflow test",
  techId: "t1",
  techName: "Dana Whitfield",
  startBlock: 4,
  reason: "Crew is on approved leave"
}

describe("failed operation ledger", () => {
  beforeEach(() => useFailedOps.getState().clear())

  it("records one entry per rejected move", () => {
    useFailedOps.getState().record(move)
    expect(useFailedOps.getState().ops).toHaveLength(1)
  })

  it("keeps a single entry when a retry fails again, with the latest reason", () => {
    useFailedOps.getState().record(move)
    const [op] = useFailedOps.getState().ops
    useFailedOps.getState().refresh(op.id, "Crew already has a job at that time")

    const ops = useFailedOps.getState().ops
    expect(ops).toHaveLength(1)
    expect(ops[0].reason).toBe("Crew already has a job at that time")
    expect(ops[0].at).toBeGreaterThanOrEqual(op.at)
  })

  it("drops the entry once a retry succeeds", () => {
    useFailedOps.getState().record(move)
    useFailedOps.getState().discard(useFailedOps.getState().ops[0].id)
    expect(useFailedOps.getState().ops).toEqual([])
  })
})
