import { describe, expect, it } from "vitest";
import {
  disaggregateForStp,
  interpretShift,
  localParts,
  previousShiftEnd,
  VIC_PUBLIC_HOLIDAYS,
} from "../src/lib/award";
import { CENTS_PER_KM, STAFF_HOURLY_RATE } from "../src/lib/constants";
import type { Shift } from "../src/types";

// The engine is timezone-explicit, so tests pin UTC to make local spans
// (07:00–18:00, Saturday noon) deterministic.
const TZ = "UTC";

function hoursOf(code: string, breakdown: ReturnType<typeof interpretShift>): number {
  return breakdown.components.find((c) => c.code === code)?.hours ?? 0;
}

function shift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: "s1",
    staffId: "tim",
    workType: "standard",
    loggedOnAt: "2026-01-05T07:00:00.000Z",
    loggedOffAt: "2026-01-05T15:00:00.000Z",
    breaks: [],
    toilElection: false,
    trackingNoticeAckAt: "2026-01-05T07:00:00.000Z",
    ...overrides,
  };
}

describe("localParts", () => {
  it("decomposes an instant into zone-local calendar parts", () => {
    const parts = localParts(new Date("2026-01-05T07:30:00.000Z"), TZ);
    expect(parts.date).toBe("2026-01-05");
    expect(parts.dow).toBe(1); // Monday
    expect(parts.minuteOfDay).toBe(7 * 60 + 30);
  });
});

describe("interpretShift — ordinary hours and the span", () => {
  it("pays weekday hours inside 07:00–18:00 at ordinary rate", () => {
    // Monday 2026-01-05.
    const b = interpretShift({ start: "2026-01-05T07:00:00Z", end: "2026-01-05T15:00:00Z", breaks: [], workType: "standard", tz: TZ });
    expect(b.components).toHaveLength(1);
    expect(hoursOf("ORDINARY", b)).toBe(8);
    expect(b.grossPay).toBe(8 * STAFF_HOURLY_RATE);
  });

  it("splits a long weekday shift into ordinary, OT@150 for the first two hours, then OT@200", () => {
    const b = interpretShift({ start: "2026-01-05T07:00:00Z", end: "2026-01-05T21:00:00Z", breaks: [], workType: "standard", tz: TZ });
    expect(hoursOf("ORDINARY", b)).toBe(11); // 07:00–18:00
    expect(hoursOf("OT_150", b)).toBe(2);    // 18:00–20:00
    expect(hoursOf("OT_200", b)).toBe(1);    // 20:00–21:00
    expect(b.grossPay).toBe(11 * 55 + 2 * 55 * 1.5 + 1 * 55 * 2);
  });

  it("consumes the earliest overtime first for early starts before 07:00", () => {
    const b = interpretShift({ start: "2026-01-05T05:00:00Z", end: "2026-01-05T15:00:00Z", breaks: [], workType: "standard", tz: TZ });
    expect(hoursOf("OT_150", b)).toBe(2); // 05:00–07:00
    expect(hoursOf("OT_200", b)).toBe(0);
    expect(hoursOf("ORDINARY", b)).toBe(8);
  });
});

describe("interpretShift — weekend and public holiday penalties", () => {
  it("pays Saturday at 150% before noon and 200% from noon", () => {
    // Saturday 2026-01-10.
    const b = interpretShift({ start: "2026-01-10T08:00:00Z", end: "2026-01-10T14:00:00Z", breaks: [], workType: "standard", tz: TZ });
    expect(hoursOf("OT_150", b)).toBe(4);
    expect(hoursOf("OT_200", b)).toBe(2);
    expect(hoursOf("ORDINARY", b)).toBe(0);
  });

  it("pays Sunday entirely at 200%", () => {
    // Sunday 2026-01-11.
    const b = interpretShift({ start: "2026-01-11T09:00:00Z", end: "2026-01-11T13:00:00Z", breaks: [], workType: "standard", tz: TZ });
    expect(b.components).toHaveLength(1);
    expect(hoursOf("OT_200", b)).toBe(4);
    expect(b.grossPay).toBe(4 * 55 * 2);
  });

  it("pays public holidays at 250%", () => {
    // New Year's Day 2026 is in the built-in holiday set.
    expect(VIC_PUBLIC_HOLIDAYS.has("2026-01-01")).toBe(true);
    const b = interpretShift({ start: "2026-01-01T07:00:00Z", end: "2026-01-01T15:00:00Z", breaks: [], workType: "standard", tz: TZ });
    expect(b.components).toHaveLength(1);
    expect(hoursOf("PH_250", b)).toBe(8);
    expect(b.grossPay).toBe(8 * 55 * 2.5);
  });
});

describe("interpretShift — breaks and work types", () => {
  it("excludes unpaid meal breaks from payable time", () => {
    const b = interpretShift({
      start: "2026-01-05T07:00:00Z",
      end: "2026-01-05T16:00:00Z",
      breaks: [{ start: "2026-01-05T12:00:00Z", end: "2026-01-05T12:45:00Z" }],
      workType: "standard",
      tz: TZ,
    });
    expect(hoursOf("ORDINARY", b)).toBe(8.25);
    expect(b.notes.some((n) => n.includes("Unpaid break"))).toBe(true);
  });

  it("treats an open break as running to the shift end", () => {
    const b = interpretShift({
      start: "2026-01-05T07:00:00Z",
      end: "2026-01-05T15:00:00Z",
      breaks: [{ start: "2026-01-05T14:00:00Z", end: null }],
      workType: "standard",
      tz: TZ,
    });
    expect(hoursOf("ORDINARY", b)).toBe(7);
  });

  it("guarantees the two-hour 200% minimum for call-backs", () => {
    const b = interpretShift({ start: "2026-01-05T20:00:00Z", end: "2026-01-05T20:30:00Z", breaks: [], workType: "callback", tz: TZ });
    expect(hoursOf("OT_200", b)).toBe(2);
    expect(b.callbackTopUpHours).toBe(1.5);
    expect(b.grossPay).toBe(2 * 55 * 2);
    expect(b.notes.some((n) => n.includes("Call-back"))).toBe(true);
  });

  it("pays inclement-weather early log-off to the end of the ordinary span", () => {
    // Wednesday 2026-01-07, logged off at 12:00 — paid through 18:00.
    const b = interpretShift({ start: "2026-01-07T07:00:00Z", end: "2026-01-07T12:00:00Z", breaks: [], workType: "inclement", tz: TZ });
    expect(hoursOf("ORDINARY", b)).toBe(11); // 5 worked + 6 top-up
    expect(b.inclementTopUpHours).toBe(6);
    expect(b.grossPay).toBe(11 * 55);
  });
});

describe("interpretShift — clause 16.5 ten-hour rest break", () => {
  it("penalises the whole shift at 200% when returning within 10 hours", () => {
    const b = interpretShift({
      start: "2026-01-06T05:00:00Z",
      end: "2026-01-06T13:00:00Z",
      breaks: [],
      workType: "standard",
      tz: TZ,
      previousShiftEnd: "2026-01-05T21:00:00Z", // 8 hrs rest
    });
    expect(b.tenHourBreach).toBe(true);
    expect(hoursOf("ORDINARY", b)).toBe(6); // 07:00–13:00
    expect(hoursOf("OT_150", b)).toBe(2);   // 05:00–07:00, escalated to 200%
    const ordinary = b.components.find((c) => c.code === "ORDINARY")!;
    expect(ordinary.multiplier).toBe(2);
    expect(ordinary.amount).toBe(6 * 55 * 2);
    expect(b.components.find((c) => c.code === "OT_150")!.multiplier).toBe(2);
    expect(b.grossPay).toBe(8 * 55 * 2);
    expect(b.notes.some((n) => n.includes("10-hour"))).toBe(true);
  });

  it("keeps a higher penalty (public holiday 250%) above the 200% floor", () => {
    // 2026-01-01 is a public holiday; also breach the rest rule.
    const b = interpretShift({
      start: "2026-01-01T07:00:00Z",
      end: "2026-01-01T11:00:00Z",
      breaks: [],
      workType: "standard",
      tz: TZ,
      previousShiftEnd: "2025-12-31T23:00:00Z", // 8 hrs rest
    });
    expect(b.tenHourBreach).toBe(true);
    const ph = b.components.find((c) => c.code === "PH_250")!;
    expect(ph.multiplier).toBe(2.5);
  });

  it("does not penalise a shift that starts after a full 10-hour break", () => {
    const b = interpretShift({
      start: "2026-01-06T05:00:00Z",
      end: "2026-01-06T13:00:00Z",
      breaks: [],
      workType: "standard",
      tz: TZ,
      previousShiftEnd: "2026-01-05T18:00:00Z", // 11 hrs rest
    });
    expect(b.tenHourBreach).toBe(false);
    expect(b.components.find((c) => c.code === "ORDINARY")!.multiplier).toBe(1);
  });
});

describe("disaggregateForStp", () => {
  const breakdown = interpretShift({
    start: "2026-01-05T07:00:00Z",
    end: "2026-01-05T21:00:00Z",
    breaks: [],
    workType: "standard",
    tz: TZ,
  }); // 11 ordinary + 2 OT150 + 1 OT200

  it("reports overtime separately from ordinary time earnings and maps km to the cents-per-km allowance", () => {
    const stp = disaggregateForStp(breakdown, { kmDriven: 100 });
    expect(stp.ordinaryTimeEarnings).toBe(11 * 55);
    expect(stp.overtime).toBe(2 * 55 * 1.5 + 1 * 55 * 2);
    expect(stp.publicHolidayPenalty).toBe(0);
    expect(stp.centsPerKmAllowance).toBe((100 * CENTS_PER_KM) / 100);
    expect(stp.kmClaimed).toBe(100);
    expect(stp.toilAccruedHours).toBe(0);
  });

  it("banks overtime as TOIL at 1:1 instead of pay when elected", () => {
    const stp = disaggregateForStp(breakdown, { toilElection: true });
    expect(stp.overtime).toBe(0);
    expect(stp.toilAccruedHours).toBe(3);
    // The three TOIL kinds remain distinct for payroll reporting.
    expect(stp.toilTakenHours).toBe(0);
    expect(stp.toilCashedOutHours).toBe(0);
  });
});

describe("previousShiftEnd", () => {
  it("finds the latest completed shift end before the given start", () => {
    const shifts = [
      shift({ id: "a", loggedOnAt: "2026-01-05T07:00:00Z", loggedOffAt: "2026-01-05T15:00:00Z" }),
      shift({ id: "b", loggedOnAt: "2026-01-05T19:00:00Z", loggedOffAt: "2026-01-05T21:00:00Z" }),
      shift({ id: "c", loggedOnAt: "2026-01-06T05:00:00Z", loggedOffAt: null }),
    ];
    expect(previousShiftEnd(shifts, "tim", "2026-01-06T05:00:00Z")).toBe("2026-01-05T21:00:00Z");
    expect(previousShiftEnd(shifts, "sarah", "2026-01-06T05:00:00Z")).toBeNull();
  });
});
