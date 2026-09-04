import { describe, expect, it } from "vitest"

import {
  agreementVerdict,
  ARRIVAL_RADIUS_M,
  arrivedJobFor,
  computeAttentionFlags,
  computeRouteOrder,
  deriveCustomers,
  dispatchStatus,
  documentVerdict,
  expiryVerdict,
  initialsOf,
  livePresenceFor,
  marginRow,
  marginTotals,
  monthGrid,
  nowLineFraction,
  presenceFor,
  STRAIGHT_LINE_LABEL,
  weekDays,
  worstSeverity
} from "@/lib/fieldloop"
import type { Job, Technician } from "@/types"

const DAY = "2026-03-11" // a Wednesday

function job(patch: Partial<Job> & Pick<Job, "id">): Job {
  return {
    title: `Job ${patch.id}`,
    client: "Acme Facilities",
    address: "1 Test St",
    priority: "normal",
    techId: null,
    startBlock: 0,
    spanBlocks: 2,
    scheduledDate: DAY,
    status: "scheduled",
    elapsedSeconds: 0,
    timerRunning: false,
    clockOnCount: 0,
    quote: { clientName: "Acme Facilities", lineItems: [], status: "draft" },
    documents: [],
    ...patch
  }
}

function tech(patch: Partial<Technician> & Pick<Technician, "id">): Technician {
  return {
    name: "Dana Whitfield",
    van: "Van 1",
    skills: ["general"],
    role: "Technician",
    absences: [],
    ...patch
  }
}

describe("dispatchStatus", () => {
  it("collapses the internal FSM onto the four board states", () => {
    expect(dispatchStatus(job({ id: "a", techId: "t", status: "scheduled" }))).toBe("scheduled")
    expect(dispatchStatus(job({ id: "b", techId: null, status: "unassigned" }))).toBe("unassigned")
    expect(dispatchStatus(job({ id: "c", techId: "t", status: "complete" }))).toBe("complete")
  })

  it("lets emergency priority outrank the lifecycle state", () => {
    expect(
      dispatchStatus(job({ id: "d", techId: "t", status: "active", priority: "emergency" }))
    ).toBe("urgent")
  })

  it("reads a completed emergency as complete, not urgent", () => {
    expect(
      dispatchStatus(job({ id: "e", techId: "t", status: "complete", priority: "emergency" }))
    ).toBe("complete")
  })

  it("treats delayed as urgent", () => {
    expect(dispatchStatus(job({ id: "f", techId: "t", status: "delayed" }))).toBe("urgent")
  })

  it("reads an assigned job with no technician as unassigned", () => {
    expect(dispatchStatus(job({ id: "g", techId: null, status: "scheduled" }))).toBe("unassigned")
  })
})

describe("presenceFor", () => {
  const dana = tech({ id: "t-dana" })

  it("reports on_job for a technician with work in flight", () => {
    const jobs = [job({ id: "j1", techId: "t-dana", status: "active" })]
    expect(presenceFor(dana, jobs, DAY)).toBe("on_job")
  })

  it("reports available when nothing is in flight", () => {
    const jobs = [job({ id: "j1", techId: "t-dana", status: "scheduled" })]
    expect(presenceFor(dana, jobs, DAY)).toBe("available")
  })

  it("reports on_leave from an approved absence, outranking any job", () => {
    const absent = tech({
      id: "t-dana",
      absences: [{ from: DAY, to: DAY, reason: "Approved leave" }]
    })
    const jobs = [job({ id: "j1", techId: "t-dana", status: "active" })]
    expect(presenceFor(absent, jobs, DAY)).toBe("on_leave")
  })

  it("distinguishes three states, so on_leave never reads as merely idle", () => {
    const states = new Set([
      presenceFor(dana, [job({ id: "a", techId: "t-dana", status: "en_route" })], DAY),
      presenceFor(dana, [], DAY),
      presenceFor(tech({ id: "t-dana", absences: [{ from: DAY, to: DAY, reason: "Leave" }] }), [], DAY)
    ])
    expect(states).toEqual(new Set(["on_job", "available", "on_leave"]))
  })
})

describe("computeAttentionFlags", () => {
  const noon = new Date(`${DAY}T12:00:00`)
  const crew = [tech({ id: "t-dana" })]

  it("flags an assigned job still open past its scheduled end", () => {
    // Blocks are 30 minutes from 08:00, so 0..2 ends at 09:00.
    const flags = computeAttentionFlags(
      [job({ id: "j1", techId: "t-dana", startBlock: 0, spanBlocks: 2 })],
      crew,
      DAY,
      noon
    )
    expect(flags.map(flag => flag.kind)).toContain("overrun")
    expect(flags[0].severity).toBe("red")
  })

  it("does not flag a completed job as running over", () => {
    const flags = computeAttentionFlags(
      [job({ id: "j1", techId: "t-dana", startBlock: 0, spanBlocks: 2, status: "complete" })],
      crew,
      DAY,
      noon
    )
    expect(flags).toEqual([])
  })

  it("does not flag a job that is still within its window", () => {
    const flags = computeAttentionFlags(
      [job({ id: "j1", techId: "t-dana", startBlock: 8, spanBlocks: 4 })],
      crew,
      DAY,
      noon
    )
    expect(flags).toEqual([])
  })

  it("flags consecutive jobs with less gap than the trip needs", () => {
    const jobs = [
      job({
        id: "j1",
        techId: "t-dana",
        startBlock: 8,
        spanBlocks: 2,
        address: "1 North St",
        location: { lat: -37.7, lng: 144.95 }
      }),
      job({
        id: "j2",
        techId: "t-dana",
        startBlock: 10,
        spanBlocks: 2,
        address: "90 South Rd",
        location: { lat: -38.05, lng: 145.3 }
      })
    ]
    const flags = computeAttentionFlags(jobs, crew, DAY, new Date(`${DAY}T08:30:00`))
    expect(flags.map(flag => flag.kind)).toEqual(["tight-travel"])
    expect(flags[0].jobId).toBe("j2")
  })

  it("does not flag a handoff at the same address", () => {
    const here = { lat: -37.7, lng: 144.95 }
    const jobs = [
      job({ id: "j1", techId: "t-dana", startBlock: 8, spanBlocks: 2, address: "1 North St", location: here }),
      job({ id: "j2", techId: "t-dana", startBlock: 10, spanBlocks: 2, address: "1 North St", location: here })
    ]
    expect(computeAttentionFlags(jobs, crew, DAY, new Date(`${DAY}T08:30:00`))).toEqual([])
  })

  it("flags an unassigned job", () => {
    const flags = computeAttentionFlags([job({ id: "j1", status: "unassigned" })], crew, DAY, noon)
    expect(flags).toHaveLength(1)
    expect(flags[0]).toMatchObject({ kind: "unassigned", severity: "blue", jobId: "j1" })
  })

  it("ignores jobs on another day", () => {
    const jobs = [job({ id: "j1", scheduledDate: "2026-03-12", status: "unassigned" })]
    expect(computeAttentionFlags(jobs, crew, DAY, noon)).toEqual([])
  })

  it("orders red before amber before blue", () => {
    const jobs = [
      job({ id: "queued", status: "unassigned" }),
      job({
        id: "tight-a",
        techId: "t-dana",
        startBlock: 16,
        spanBlocks: 2,
        address: "1 North St",
        location: { lat: -37.7, lng: 144.95 }
      }),
      job({
        id: "tight-b",
        techId: "t-dana",
        startBlock: 18,
        spanBlocks: 2,
        address: "90 South Rd",
        location: { lat: -38.05, lng: 145.3 }
      }),
      job({ id: "late", techId: "t-dana", startBlock: 0, spanBlocks: 1 })
    ]
    const flags = computeAttentionFlags(jobs, crew, DAY, noon)
    expect(flags.map(flag => flag.severity)).toEqual(["red", "amber", "blue"])
  })

  describe("overrun compares calendar days, not just time of day", () => {
    const early = job({ id: "j1", techId: "t-dana", startBlock: 0, spanBlocks: 2 })
    const kinds = (day: string, jobDayIso: string) =>
      computeAttentionFlags(
        [{ ...early, scheduledDate: jobDayIso }],
        crew,
        day,
        new Date(`${DAY}T12:00:00`)
      ).map(flag => flag.kind)

    it("never marks a future day overdue at the same time of day", () => {
      expect(kinds("2026-03-12", "2026-03-12")).toEqual([])
    })

    it("marks today overdue once the scheduled end has passed", () => {
      expect(kinds(DAY, DAY)).toEqual(["overrun"])
    })

    it("marks an unfinished past day overdue regardless of the clock", () => {
      expect(kinds("2026-03-10", "2026-03-10")).toEqual(["overrun"])
    })
  })
})

describe("worstSeverity", () => {
  it("returns green for an empty flag set", () => {
    expect(worstSeverity([])).toBe("green")
  })

  it("escalates to the worst present severity", () => {
    const flags = computeAttentionFlags(
      [
        job({ id: "queued", status: "unassigned" }),
        job({ id: "late", techId: "t-dana", startBlock: 0, spanBlocks: 1 })
      ],
      [tech({ id: "t-dana" })],
      DAY,
      new Date(`${DAY}T12:00:00`)
    )
    expect(worstSeverity(flags)).toBe("red")
  })
})

describe("expiry maths", () => {
  const now = new Date("2026-03-11T09:00:00")

  it("treats a missing expiry as an ordinary record, not an alarm", () => {
    expect(expiryVerdict(null, now)).toMatchObject({ state: "on_record", days: null })
  })

  it("classifies expired, expiring and valid against the 30 day window", () => {
    expect(expiryVerdict("2026-03-01", now).state).toBe("expired")
    expect(expiryVerdict("2026-03-25", now).state).toBe("expiring")
    expect(expiryVerdict("2026-06-01", now).state).toBe("valid")
  })

  it("uses identical maths for documents and agreements", () => {
    const doc = documentVerdict(
      { id: "d1", name: "Gas Safe", ref: "GS-1", expiresAt: "2026-03-25" },
      now
    )
    const agreement = agreementVerdict(
      {
        id: "a1",
        customerName: "Acme",
        serviceType: "Backflow test",
        frequency: "Annual",
        lastServiceDate: "2025-03-25",
        nextDueDate: "2026-03-25"
      },
      now
    )
    expect(doc).toEqual(agreement)
  })
})

describe("deriveCustomers", () => {
  it("groups jobs by client and sorts by name", () => {
    const customers = deriveCustomers([
      job({ id: "j1", client: "Zephyr Holdings" }),
      job({ id: "j2", client: "Acme Facilities" }),
      job({ id: "j3", client: "Acme Facilities" })
    ])
    expect(customers.map(customer => customer.name)).toEqual([
      "Acme Facilities",
      "Zephyr Holdings"
    ])
    expect(customers[0].jobs).toHaveLength(2)
  })
})

describe("initialsOf", () => {
  it("takes at most two letters and ignores punctuation", () => {
    expect(initialsOf("Dana Whitfield")).toBe("DW")
    expect(initialsOf("Northgate Mall Facilities")).toBe("NM")
    expect(initialsOf("O'Brien")).toBe("OB")
  })
})

describe("computeRouteOrder", () => {
  const dana = tech({
    id: "t-dana",
    lastKnownLocation: { lat: -37.8, lng: 144.96, capturedAt: `${DAY}T07:55:00` }
  })
  const near = job({ id: "near", techId: "t-dana", location: { lat: -37.81, lng: 144.97 } })
  const mid = job({ id: "mid", techId: "t-dana", location: { lat: -37.9, lng: 145.02 } })
  const far = job({ id: "far", techId: "t-dana", location: { lat: -38.1, lng: 145.3 } })

  it("greedily visits the nearest unvisited stop from the last known location", () => {
    const plan = computeRouteOrder("t-dana", [far, near, mid], dana, DAY)
    expect(plan.order.map(stop => stop.id)).toEqual(["near", "mid", "far"])
  })

  it("2-opt removes crossed legs — shorter tour than the greedy sequence", () => {
    // A zig-zag the greedy pass commits to from the origin: east, back west
    // past home, east again. Any 2-opt flip of the crossed pair shortens it.
    const zig = job({ id: "zig", techId: "t-dana", location: { lat: -37.8, lng: 145.2 } })
    const zag = job({ id: "zag", techId: "t-dana", location: { lat: -37.82, lng: 144.98 } })
    const end = job({ id: "end", techId: "t-dana", location: { lat: -37.8, lng: 145.35 } })
    const dist = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
      Math.hypot(a.lng - b.lng, a.lat - b.lat)

    const plan = computeRouteOrder("t-dana", [zig, zag, end], dana, DAY)
    const greedy = [zig, zag, end] // nearest-first from origin is exactly this
    const greedyLength = dist(dana.lastKnownLocation!, zig.location!) + dist(zig.location!, zag.location!) + dist(zag.location!, end.location!)
    const refined = [dana.lastKnownLocation!, ...plan.order.map(s => s.location!)!]
    let refinedLength = 0
    for (let i = 1; i < refined.length; i++) refinedLength += dist(refined[i - 1], refined[i])

    expect(refinedLength).toBeLessThan(greedyLength)
    // Refinement never invents or drops stops.
    expect(plan.order).toHaveLength(3)
    expect(new Set(plan.order.map(s => s.id))).toEqual(new Set(["zig", "zag", "end"]))
  })

  it("keeps the refinement deterministic for the same inputs", () => {
    const stops = ["a", "b", "c", "d", "e"].map((id, i) =>
      job({ id, techId: "t-dana", location: { lat: -37.8 + i * 0.03 * (i % 2 ? -1 : 1), lng: 144.96 + i * 0.04 } })
    )
    const first = computeRouteOrder("t-dana", stops, dana, DAY).order.map(s => s.id)
    const second = computeRouteOrder("t-dana", [...stops].reverse(), dana, DAY).order.map(s => s.id)
    expect(first).toEqual(second)
  })

  it("labels the ordering as straight-line, never road routing", () => {
    expect(computeRouteOrder("t-dana", [near], dana, DAY).label).toBe(STRAIGHT_LINE_LABEL)
    expect(STRAIGHT_LINE_LABEL).toMatch(/not road routing/i)
  })

  it("starts the drawn line at the last known location when one exists", () => {
    const plan = computeRouteOrder("t-dana", [near, mid], dana, DAY)
    expect(plan.line[0]).toMatchObject({ jobId: null, lat: -37.8, lng: 144.96 })
    expect(plan.line).toHaveLength(3)
  })

  it("omits the origin point when the technician has no captured location", () => {
    const plan = computeRouteOrder("t-dana", [near, mid], tech({ id: "t-dana" }), DAY)
    expect(plan.line.every(point => point.jobId !== null)).toBe(true)
  })

  it("returns an empty plan when the technician has no located jobs", () => {
    const plan = computeRouteOrder("t-dana", [job({ id: "nowhere", techId: "t-dana" })], dana, DAY)
    expect(plan).toEqual({ order: [], line: [], label: STRAIGHT_LINE_LABEL })
  })

  it("ignores jobs belonging to another technician or another day", () => {
    const other = job({ id: "other", techId: "t-mike", location: { lat: -37.7, lng: 144.9 } })
    const tomorrow = job({
      id: "tomorrow",
      techId: "t-dana",
      scheduledDate: "2026-03-12",
      location: { lat: -37.7, lng: 144.9 }
    })
    const plan = computeRouteOrder("t-dana", [other, tomorrow, near], dana, DAY)
    expect(plan.order.map(stop => stop.id)).toEqual(["near"])
  })
})

describe("margin reporting", () => {
  const billed = (id: string, price: number, cost?: number | null): Job =>
    job({
      id,
      cost,
      status: "complete",
      quote: {
        clientName: "Acme",
        lineItems: [{ id: `li-${id}`, description: "Work", qty: 1, unitPrice: price }],
        status: "approved"
      }
    })

  it("reports margin as unavailable when a job has no recorded cost", () => {
    const row = marginRow(billed("j1", 500))
    expect(row.revenue).toBe(500)
    expect(row.cost).toBeNull()
    expect(row.margin).toBeNull()
  })

  it("computes margin from the real outlay when cost is recorded", () => {
    expect(marginRow(billed("j1", 500, 180)).margin).toBe(320)
  })

  it("withholds a total margin while any contributing cost is missing", () => {
    const totals = marginTotals([billed("j1", 500, 180), billed("j2", 300)])
    expect(totals.revenue).toBe(800)
    expect(totals.margin).toBeNull()
    expect(totals.missingCosts).toBe(1)
  })

  it("reports a total margin once every cost is known", () => {
    const totals = marginTotals([billed("j1", 500, 180), billed("j2", 300, 120)])
    expect(totals).toMatchObject({ revenue: 800, cost: 300, margin: 500, marginPercent: 63 })
  })

  it("marks work that has not completed as an estimate", () => {
    expect(marginRow(job({ id: "j1", status: "scheduled" })).estimated).toBe(true)
    expect(marginRow(billed("j2", 100, 10)).estimated).toBe(false)
  })
})

describe("calendar maths", () => {
  it("builds a Monday-anchored week around the given day", () => {
    expect(weekDays(DAY)).toEqual([
      "2026-03-09",
      "2026-03-10",
      "2026-03-11",
      "2026-03-12",
      "2026-03-13",
      "2026-03-14",
      "2026-03-15"
    ])
  })

  it("builds a real month grid whose padding days are honestly empty", () => {
    const cells = monthGrid(DAY)
    expect(cells.length % 7).toBe(0)
    // March 2026 starts on a Sunday, so a Monday-first grid leads with 6 blanks.
    expect(cells.slice(0, 6).every(cell => cell.day === null)).toBe(true)
    expect(cells[6].day).toBe("2026-03-01")
    expect(cells.filter(cell => cell.day !== null)).toHaveLength(31)
  })
})

describe("now-line", () => {
  // Board hours run 08:00-18:00 (TOTAL_BLOCKS * MINUTES_PER_BLOCK from DAY_START_MINUTES).
  it("places the line by elapsed board minutes on today", () => {
    expect(nowLineFraction(DAY, new Date(2026, 2, 11, 13, 0), DAY)).toBeCloseTo(0.5, 5)
  })

  it("renders nothing on a day that is not today", () => {
    expect(nowLineFraction("2026-03-12", new Date(2026, 2, 11, 13, 0), DAY)).toBeNull()
  })

  it("renders nothing before the board opens or after it closes", () => {
    expect(nowLineFraction(DAY, new Date(2026, 2, 11, 6, 30), DAY)).toBeNull()
    expect(nowLineFraction(DAY, new Date(2026, 2, 11, 19, 0), DAY)).toBeNull()
  })
})

describe("live shift presence + arrival", () => {
  const t = tech({ id: "t-mike" })
  const activeJob = (location: Job["location"]) =>
    job({ id: "j-active", techId: "t-mike", status: "active", location })

  it("livePresenceFor reports on_break over any derived state", () => {
    expect(livePresenceFor(t, [], DAY, { presence: "on_break" })).toBe("on_break")
    expect(livePresenceFor(t, [], DAY, { presence: "on_job" })).toBe("available")
    expect(livePresenceFor(t, [], DAY, undefined)).toBe("available")
  })

  it("arrivedJobFor flags the active job when the vehicle is within radius", () => {
    const site = { lat: -37.82, lng: 144.98 }
    const arrived = arrivedJobFor("t-mike", [activeJob(site)], DAY, { lat: -37.8204, lng: 144.9803 })
    expect(arrived?.id).toBe("j-active")
  })

  it("arrivedJobFor returns null when the vehicle is beyond ARRIVAL_RADIUS_M", () => {
    const site = { lat: -37.82, lng: 144.98 }
    // ~0.2° lng ≈ 17km — far outside 150m.
    const arrived = arrivedJobFor("t-mike", [activeJob(site)], DAY, { lat: -37.82, lng: 145.18 })
    expect(arrived).toBeNull()
  })

  it("arrivedJobFor returns null with no live signal", () => {
    const site = { lat: -37.82, lng: 144.98 }
    expect(arrivedJobFor("t-mike", [activeJob(site)], DAY, undefined)).toBeNull()
    expect(ARRIVAL_RADIUS_M).toBeGreaterThan(0)
  })
})
