import { describe, expect, it } from "vitest"
import { optimizeRoutes, DEPOT } from "@/lib/optimize"
import { rankCrews } from "@/lib/assignment"
import { travelMinutes } from "@/lib/travel"
import { technicians, jobs } from "@/data/seed"
import { isoDay } from "@/lib/format"

const today = isoDay(0)
const config = { scope: "unassigned" as const, maxRoutes: 3, maxTasksPerRoute: 8, maxHoursPerRoute: 8 }

describe("optimizeRoutes (Route Optimizer engine)", () => {
  it("serves the emergency tier first on the emptiest qualified van and respects travel gaps", () => {
    const result = optimizeRoutes(today, jobs, technicians, config)
    const dana = result.routes.find(r => r.techId === "t-dana")
    expect(dana).toBeDefined()
    expect(dana!.stops[0].jobId).toBe("j-1001")

    // Every stop after the first reserves at least one travel block, so no
    // two stops on a route are ever adjacent on the canvas.
    for (const route of result.routes) {
      for (let i = 1; i < route.stops.length; i++) {
        const prev = route.stops[i - 1]
        const stop = route.stops[i]
        expect(stop.startBlock).toBeGreaterThanOrEqual(prev.startBlock + prev.spanBlocks + 1)
        expect(stop.travelFromPrevMin).toBeGreaterThan(0)
      }
    }
  })

  it("never routes work onto absent technicians or skill-mismatched vans", () => {
    const result = optimizeRoutes(today, jobs, technicians, config)
    expect(result.routes.find(r => r.techId === "t-priya")).toBeUndefined()
    for (const route of result.routes) {
      const tech = technicians.find(t => t.id === route.techId)!
      for (const stop of route.stops) {
        const job = jobs.find(j => j.id === stop.jobId)!
        if (job.requiredSkill) expect(tech.skills).toContain(job.requiredSkill)
      }
    }
  })

  it("spills overflow past the task cap onto the next lightest van", () => {
    const result = optimizeRoutes(today, jobs, technicians, { ...config, maxTasksPerRoute: 2 })
    const dana = result.routes.find(r => r.techId === "t-dana")!
    // j-1008 and j-1007 both land somewhere — Dana caps at two stops.
    expect(dana.stops.length).toBeLessThanOrEqual(2)
    const placedEverywhere = result.routes.flatMap(r => r.stops.map(s => s.jobId))
    expect(placedEverywhere).toContain("j-1001")
    expect(placedEverywhere).toContain("j-1007")
    expect(placedEverywhere).toContain("j-1008")
    expect(result.unplaced).toHaveLength(0)
  })

  it("flags jobs that cannot fit the duration budget with an honest reason", () => {
    const result = optimizeRoutes(today, jobs, technicians, { ...config, maxHoursPerRoute: 1 })
    // A one-hour budget cannot hold the day — everything lands in unplaced
    // with reasons, never silently dropped.
    const ids = result.unplaced.map(u => u.jobId)
    expect(ids).toContain("j-1001")
    expect(result.unplaced.every(u => u.reason.length > 0)).toBe(true)
  })

  it("keeps every stop inside the 08:00–18:00 board day", () => {
    const result = optimizeRoutes(today, jobs, technicians, { ...config, maxTasksPerRoute: 40 })
    for (const route of result.routes) {
      for (const stop of route.stops) {
        expect(stop.startBlock).toBeGreaterThanOrEqual(0)
        expect(stop.startBlock + stop.spanBlocks).toBeLessThanOrEqual(20)
      }
    }
  })
})

describe("rankCrews (AI scheduling suggestions)", () => {
  it("gates on skill AND approved leave, then ranks by drive time", () => {
    const ranked = rankCrews(jobs[0], technicians, jobs) // j-1001 drainage, north
    const best = ranked[0]
    expect(best.tech.id).toBe("t-dana") // only drainage holder not on leave
    expect(best.qualified).toBe(true)
    expect(best.driveMinutes).toBeGreaterThan(0)

    const priya = ranked.find(r => r.tech.id === "t-priya")!
    expect(priya.qualified).toBe(false)
    expect(priya.disqualifier).toBe("leave")

    const mike = ranked.find(r => r.tech.id === "t-mike")!
    expect(mike.qualified).toBe(false)
    expect(mike.disqualifier).toBe("skill")
  })
})

describe("travelMinutes", () => {
  it("is deterministic and rounds to 5-minute blocks with a floor", () => {
    expect(travelMinutes(DEPOT, DEPOT)).toBe(5)
    const a = { lat: -37.7, lng: 144.95 }
    const b = { lat: -37.88, lng: 145.05 }
    expect(travelMinutes(a, b)).toBe(travelMinutes(a, b))
    expect(travelMinutes(a, b) % 5).toBe(0)
  })
})
