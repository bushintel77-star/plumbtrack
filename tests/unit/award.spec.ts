import { describe, expect, it } from "vitest"

import { disaggregateForStp, interpretShift, localParts } from "@/lib/award"

describe("MA000036 award engine (ported from apps/web)", () => {
  it("classifies ordinary weekday span correctly", () => {
    const parts = localParts(new Date("2026-08-31T01:30:00.000Z"), "Australia/Melbourne")
    expect(parts.dow).toBe(1) // Monday
    expect(parts.minuteOfDay).toBe(11 * 60 + 30)
  })

  it("pays an ordinary-hours shift at 1x inside the span", () => {
    const breakdown = interpretShift({
      start: "2026-08-30T23:00:00.000Z", // Mon 09:00 AEST
      end: "2026-08-31T01:00:00.000Z", //   Mon 11:00 AEST
      breaks: [],
      workType: "standard"
    })
    expect(breakdown.totalHours).toBe(2)
    expect(breakdown.components).toHaveLength(1)
    expect(breakdown.components[0].code).toBe("ORDINARY")
  })

  it("weekday overtime after 18:00 is 150% then 200%", () => {
    const breakdown = interpretShift({
      start: "2026-08-31T07:00:00.000Z", // Mon 17:00 AEST
      end: "2026-08-31T10:30:00.000Z", //  Mon 20:30 AEST — 1h ordinary + 2.5h OT
      breaks: [],
      workType: "standard"
    })
    const ot150 = breakdown.components.find(c => c.code === "OT_150")
    const ot200 = breakdown.components.find(c => c.code === "OT_200")
    expect(ot150?.hours).toBe(2)
    expect(ot200?.hours).toBe(0.5)
  })

  it("call-back applies the two-hour minimum at 200%", () => {
    const breakdown = interpretShift({
      start: "2026-08-30T23:00:00.000Z",
      end: "2026-08-30T23:30:00.000Z", // 30-minute call-out
      breaks: [],
      workType: "callback"
    })
    expect(breakdown.totalHours).toBe(2)
    expect(breakdown.callbackTopUpHours).toBe(1.5)
    expect(breakdown.components.every(c => c.multiplier === 2)).toBe(true)
  })

  it("clause 16.5 breaches without a 10-hour rest — whole shift at 200%+", () => {
    const breakdown = interpretShift({
      start: "2026-08-30T23:00:00.000Z",
      end: "2026-08-31T01:00:00.000Z",
      breaks: [],
      workType: "standard",
      previousShiftEnd: "2026-08-30T17:00:00.000Z" // only 6 hrs rest
    })
    expect(breakdown.tenHourBreach).toBe(true)
    expect(breakdown.components.every(c => c.multiplier >= 2)).toBe(true)
  })

  it("TOIL election moves overtime out of cash pay for STP", () => {
    const breakdown = interpretShift({
      start: "2026-08-31T07:00:00.000Z",
      end: "2026-08-31T10:00:00.000Z", // 1h ordinary + 2h OT
      breaks: [],
      workType: "standard"
    })
    const stp = disaggregateForStp(breakdown, { kmDriven: 40, toilElection: true })
    expect(stp.overtime).toBe(0)
    expect(stp.toilAccruedHours).toBe(2)
    expect(stp.centsPerKmAllowance).toBe(35.2) // 40 km × 88c
  })
})
