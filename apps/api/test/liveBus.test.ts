import { afterEach, describe, expect, it, vi } from "vitest"

import { clearLiveBus, publishToOrg, subscribeOrg } from "../src/lib/liveBus"

afterEach(() => {
  clearLiveBus()
})

describe("liveBus (org-scoped real-time fan-out)", () => {
  it("delivers frames only to the publishing org's subscribers", () => {
    const orgA = vi.fn()
    const orgB = vi.fn()
    const unsubscribeA = subscribeOrg("org-a", orgA)
    subscribeOrg("org-b", orgB)

    publishToOrg({ topic: "topic/jobs/status", orgId: "org-a", jobId: "j-1", status: "completed" })

    expect(orgA).toHaveBeenCalledOnce()
    expect(orgB).not.toHaveBeenCalled()
    unsubscribeA()
  })

  it("unsubscribe stops delivery and empties the channel", () => {
    const listener = vi.fn()
    const unsubscribe = subscribeOrg("org-a", listener)
    unsubscribe()

    publishToOrg({ topic: "topic/jobs/status", orgId: "org-a", jobId: "j-1", status: "completed" })
    expect(listener).not.toHaveBeenCalled()
  })

  it("a throwing subscriber never breaks the publisher or other subscribers", () => {
    const broken = vi.fn(() => {
      throw new Error("dead socket write")
    })
    const healthy = vi.fn()
    subscribeOrg("org-a", broken)
    subscribeOrg("org-a", healthy)

    expect(() =>
      publishToOrg({ topic: "topic/jobs/created", orgId: "org-a", job: { id: "j-2" } })
    ).not.toThrow()
    expect(healthy).toHaveBeenCalledOnce()
  })

  it("publishing to an org with no subscribers is a no-op", () => {
    expect(() =>
      publishToOrg({ topic: "topic/jobs/updated", orgId: "ghost", jobId: "j-1", patch: {} })
    ).not.toThrow()
  })
})
