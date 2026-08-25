import { CENTS_PER_KM, STAFF_HOURLY_RATE } from "./constants";
import type { Shift, ShiftWorkType } from "@/types";

// ── Plumbing and Fire Sprinklers Award 2020 (MA000036) shift interpretation ──
//
// Pure functions only — no React, no I/O — so payroll rules can be unit
// tested against exact timestamps. All rule references below are to the
// Award conditions summarised in the 2026 FSM standards:
//   - Ordinary hours fall 07:00–18:00 Mon–Fri; outside the span is overtime.
//   - Mon–Fri overtime: 150% for the first two hours, 200% after.
//   - Saturday: 150% before noon, 200% from noon.
//   - Sunday: 200%. Public holidays: 250%.
//   - Clause 16.5: returning to work without a 10-hour break penalises the
//     whole shift at 200% (higher penalties, e.g. public holidays, prevail).
//   - Call-backs pay a two-hour minimum at 200%.
//   - Inclement weather: log-off early is still paid to the end of the
//     ordinary span.

/** Local-time boundaries, minutes since local midnight. */
export const ORDINARY_SPAN_START_MIN = 7 * 60;
export const ORDINARY_SPAN_END_MIN = 18 * 60;
export const SATURDAY_NOON_MIN = 12 * 60;

const MIN_MS = 60_000;
/** Mon–Fri overtime paid at 150% before this much overtime has accrued. */
export const OT_150_CAP_MS = 2 * 60 * MIN_MS;
/** Minimum rest between shifts before the next shift is penalised (cl 16.5). */
export const TEN_HOUR_BREAK_MS = 10 * 60 * MIN_MS;
/** Call-back minimum payment at 200%. */
export const CALLBACK_MIN_MS = 2 * 60 * MIN_MS;

export const DEFAULT_TZ = "Australia/Melbourne";

export type PayCode = "ORDINARY" | "OT_150" | "OT_200" | "PH_250";

export interface PayComponent {
  code: PayCode;
  label: string;
  /** Payable hours, 2dp. */
  hours: number;
  multiplier: number;
  /** hours × hourly rate × multiplier, 2dp. */
  amount: number;
}

export interface ShiftPayBreakdown {
  components: PayComponent[];
  /** Total payable hours (worked + top-ups), 2dp. */
  totalHours: number;
  /** Total pay before allowances/TOIL, 2dp. */
  grossPay: number;
  /** Human-readable notes for every award rule that fired. */
  notes: string[];
  /** Clause 16.5 breached — the whole shift was paid at 200%+. */
  tenHourBreach: boolean;
  /** Hours added to reach the two-hour call-back minimum. */
  callbackTopUpHours: number;
  /** Hours paid past log-off to the end of the ordinary span (inclement weather). */
  inclementTopUpHours: number;
}

// ── Public holidays ─────────────────────────────────────────────────────────

/**
 * VIC public holidays (local dates) used to trigger 250% penalty rates.
 * Demo dataset covering the current award cycle — replace with the gazetted
 * feed in production.
 */
export const VIC_PUBLIC_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2025
  "2025-01-01", "2025-01-27", "2025-03-10", "2025-04-18", "2025-04-19",
  "2025-04-21", "2025-04-25", "2025-06-09", "2025-09-26", "2025-12-25",
  "2025-12-26",
  // 2026
  "2026-01-01", "2026-01-26", "2026-03-09", "2026-04-03", "2026-04-04",
  "2026-04-06", "2026-04-25", "2026-04-27", "2026-06-08", "2026-09-25",
  "2026-12-25", "2026-12-28",
]);

// ── Local-time helpers ──────────────────────────────────────────────────────

interface LocalParts {
  /** YYYY-MM-DD in the target zone. */
  date: string;
  /** 0=Sunday … 6=Saturday. */
  dow: number;
  /** Minutes since local midnight. */
  minuteOfDay: number;
}

/** Decompose an instant into calendar parts for the worked zone. */
export function localParts(date: Date, tz: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-AU", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    date: dateStr,
    dow: new Date(`${dateStr}T12:00:00Z`).getUTCDay(),
    minuteOfDay: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
  };
}

// ── Interval helpers ────────────────────────────────────────────────────────

function toMs(iso: string): number {
  return new Date(iso).getTime();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Shift interpretation ────────────────────────────────────────────────────

export interface InterpretShiftInput {
  /** ISO-8601 UTC log-on timestamp. */
  start: string;
  /** ISO-8601 UTC log-off timestamp (pass "now" for a running shift preview). */
  end: string;
  /** Unpaid meal breaks (open breaks are treated as running to `end`). */
  breaks: Array<{ start: string; end: string | null }>;
  workType: ShiftWorkType;
  /** Ordinary hourly pay rate. */
  hourlyRate?: number;
  /** Previous shift's log-off timestamp — used for the clause 16.5 check. */
  previousShiftEnd?: string | null;
  tz?: string;
  /** Public holidays, defaults to the built-in VIC set. */
  publicHolidays?: ReadonlySet<string>;
}

const PAY_LABELS: Record<PayCode, string> = {
  ORDINARY: "Ordinary hours",
  OT_150: "Overtime — first 2 hrs (150%)",
  OT_200: "Overtime (200%)",
  PH_250: "Public holiday (250%)",
};

/** Classify one worked minute into a base pay code (call-backs override later). */
function classifyMinute(
  parts: LocalParts,
  holidays: ReadonlySet<string>,
): PayCode | "WEEKDAY_OT" {
  if (holidays.has(parts.date)) return "PH_250";
  if (parts.dow === 0) return "OT_200"; // Sunday
  if (parts.dow === 6) {
    // Saturday: 150% before noon, 200% from noon.
    return parts.minuteOfDay < SATURDAY_NOON_MIN ? "OT_150" : "OT_200";
  }
  const inOrdinarySpan =
    parts.minuteOfDay >= ORDINARY_SPAN_START_MIN && parts.minuteOfDay < ORDINARY_SPAN_END_MIN;
  return inOrdinarySpan ? "ORDINARY" : "WEEKDAY_OT";
}

/**
 * Interpret one shift against MA000036 and return its pay components.
 * Worked time is measured to the minute, excluding unpaid breaks.
 */
export function interpretShift(input: InterpretShiftInput): ShiftPayBreakdown {
  const rate = input.hourlyRate ?? STAFF_HOURLY_RATE;
  const tz = input.tz ?? DEFAULT_TZ;
  const holidays = input.publicHolidays ?? VIC_PUBLIC_HOLIDAYS;
  const notes: string[] = [];

  const startMs = toMs(input.start);
  const endMs = toMs(input.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return {
      components: [], totalHours: 0, grossPay: 0, notes,
      tenHourBreach: false, callbackTopUpHours: 0, inclementTopUpHours: 0,
    };
  }

  // Unpaid break windows in ms (an open break runs to the shift's end).
  const breakWindows = input.breaks
    .map((b) => {
      const bs = toMs(b.start);
      const be = b.end ? toMs(b.end) : endMs;
      return [Math.max(bs, startMs), Math.min(be, endMs)] as const;
    })
    .filter(([bs, be]) => be > bs);
  const onBreak = (ms: number) => breakWindows.some(([bs, be]) => ms >= bs && ms < be);

  // Walk the shift minute by minute, bucketing chronologically so the
  // weekday "first two overtime hours" cap consumes the earliest OT minutes.
  const buckets = new Map<PayCode, number>();
  let weekdayOtSeen = 0;
  for (let ms = startMs; ms < endMs; ms += MIN_MS) {
    if (onBreak(ms)) continue;
    const cls = classifyMinute(localParts(new Date(ms), tz), holidays);
    let code: PayCode;
    if (cls === "WEEKDAY_OT") {
      code = weekdayOtSeen < OT_150_CAP_MS ? "OT_150" : "OT_200";
      weekdayOtSeen += MIN_MS;
    } else {
      code = cls;
    }
    buckets.set(code, (buckets.get(code) ?? 0) + MIN_MS);
  }
  if (breakWindows.length > 0) {
    notes.push(`Unpaid break(s) excluded: ${(breakWindows.reduce((s, [bs, be]) => s + (be - bs), 0) / 3_600_000).toFixed(2)} hrs`);
  }

  let callbackTopUpMs = 0;
  let inclementTopUpMs = 0;

  if (input.workType === "callback") {
    // Call-back: everything at 200%, two-hour minimum regardless of duration.
    const workedMs = [...buckets.values()].reduce((s, ms) => s + ms, 0);
    buckets.clear();
    buckets.set("OT_200", Math.max(workedMs, CALLBACK_MIN_MS));
    callbackTopUpMs = Math.max(0, CALLBACK_MIN_MS - workedMs);
    notes.push("Call-back: minimum payment of 2 hrs at 200% applied");
    if (callbackTopUpMs > 0) {
      notes.push(`Call-back top-up: ${(callbackTopUpMs / 3_600_000).toFixed(2)} hrs added to reach the minimum`);
    }
  }

  if (input.workType === "inclement") {
    // Inclement weather: early log-off on a weekday is paid to the end of
    // the ordinary span (18:00) with no loss of wages.
    const endParts = localParts(new Date(endMs), tz);
    const isWeekday = endParts.dow >= 1 && endParts.dow <= 5;
    if (isWeekday && !holidays.has(endParts.date) && endParts.minuteOfDay < ORDINARY_SPAN_END_MIN) {
      const spanEndMs = endMs + (ORDINARY_SPAN_END_MIN - endParts.minuteOfDay) * MIN_MS;
      for (let ms = endMs; ms < spanEndMs; ms += MIN_MS) {
        inclementTopUpMs += MIN_MS;
      }
      if (inclementTopUpMs > 0) {
        buckets.set("ORDINARY", (buckets.get("ORDINARY") ?? 0) + inclementTopUpMs);
        notes.push(
          `Inclement weather: paid to end of ordinary span — ${(inclementTopUpMs / 3_600_000).toFixed(2)} hrs top-up`,
        );
      }
    }
  }

  // Clause 16.5: back at work within 10 hrs of the previous log-off → the
  // whole shift is penalised at 200% (a higher penalty, e.g. a public
  // holiday, prevails over the floor).
  let tenHourBreach = false;
  if (input.previousShiftEnd) {
    const restMs = startMs - toMs(input.previousShiftEnd);
    if (restMs < TEN_HOUR_BREAK_MS) {
      tenHourBreach = true;
      notes.push(
        `No 10-hour rest break after overtime (${(restMs / 3_600_000).toFixed(2)} hrs rest) — shift paid at 200% until a full break is taken`,
      );
    }
  }

  const components: PayComponent[] = [];
  for (const [code, ms] of buckets) {
    if (ms <= 0) continue;
    const multiplier =
      code === "ORDINARY" ? 1 : code === "OT_150" ? 1.5 : code === "OT_200" ? 2 : 2.5;
    const effective = tenHourBreach ? Math.max(multiplier, 2) : multiplier;
    const hours = round2(ms / 3_600_000);
    components.push({
      code,
      label:
        effective !== multiplier
          ? `${PAY_LABELS[code]} — paid at ${Math.round(effective * 100)}% (no 10-hr rest)`
          : PAY_LABELS[code],
      hours,
      multiplier: effective,
      amount: round2(hours * rate * effective),
    });
  }
  const order: PayCode[] = ["ORDINARY", "OT_150", "OT_200", "PH_250"];
  components.sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));

  const totalHours = round2(components.reduce((s, c) => s + c.hours, 0));
  const grossPay = round2(components.reduce((s, c) => s + c.amount, 0));
  return {
    components,
    totalHours,
    grossPay,
    notes,
    tenHourBreach,
    callbackTopUpHours: round2(callbackTopUpMs / 3_600_000),
    inclementTopUpHours: round2(inclementTopUpMs / 3_600_000),
  };
}

// ── STP Phase 2 disaggregation ──────────────────────────────────────────────

export interface StpDisaggregation {
  /** Ordinary Time Earnings — never mixed with overtime for ATO reporting. */
  ordinaryTimeEarnings: number;
  /** Overtime reported separately from OTE (call-back penalties land here). */
  overtime: number;
  /** Public holiday penalty amounts (250% component). */
  publicHolidayPenalty: number;
  /** Cents-per-km travel allowance, reported as a distinct allowance. */
  centsPerKmAllowance: number;
  kmClaimed: number;
  /** TOIL accrued at 1:1 instead of overtime pay (hours). */
  toilAccruedHours: number;
  /** Overtime cashed-out amounts are reported as overtime; unused TOIL on
   *  termination is tracked by payroll — both start at zero here. */
  toilTakenHours: number;
  toilCashedOutHours: number;
}

/**
 * Split a shift's pay into STP Phase 2 reporting categories: overtime is
 * never bundled into ordinary earnings, allowances are reported by type,
 * and an elected TOIL 1:1 accrual removes the overtime from cash pay.
 */
export function disaggregateForStp(
  breakdown: ShiftPayBreakdown,
  opts: { kmDriven?: number; toilElection?: boolean } = {},
): StpDisaggregation {
  const ordinary = breakdown.components
    .filter((c) => c.code === "ORDINARY")
    .reduce((s, c) => s + c.amount, 0);
  let overtime = breakdown.components
    .filter((c) => c.code === "OT_150" || c.code === "OT_200")
    .reduce((s, c) => s + c.amount, 0);
  const publicHoliday = breakdown.components
    .filter((c) => c.code === "PH_250")
    .reduce((s, c) => s + c.amount, 0);

  const overtimeHours = breakdown.components
    .filter((c) => c.code === "OT_150" || c.code === "OT_200")
    .reduce((s, c) => s + c.hours, 0);
  const toilAccruedHours = opts.toilElection ? round2(overtimeHours) : 0;
  if (opts.toilElection) overtime = 0;

  const kmClaimed = opts.kmDriven ?? 0;
  return {
    ordinaryTimeEarnings: round2(ordinary),
    overtime: round2(overtime),
    publicHolidayPenalty: round2(publicHoliday),
    centsPerKmAllowance: round2((kmClaimed * CENTS_PER_KM) / 100),
    kmClaimed,
    toilAccruedHours,
    toilTakenHours: 0,
    toilCashedOutHours: 0,
  };
}

/** Convenience: interpret a stored Shift directly (chain-aware). */
export function interpretStoredShift(
  shift: Shift,
  previousShiftEnd: string | null,
  overrides: Partial<Pick<InterpretShiftInput, "end" | "hourlyRate" | "tz">> = {},
): ShiftPayBreakdown {
  return interpretShift({
    start: shift.loggedOnAt,
    end: overrides.end ?? shift.loggedOffAt ?? new Date().toISOString(),
    breaks: shift.breaks,
    workType: shift.workType,
    hourlyRate: overrides.hourlyRate,
    previousShiftEnd,
    tz: overrides.tz,
  });
}

/**
 * The staff member's most recent completed shift end before `startIso` —
 * feeds the clause 16.5 ten-hour-rest check.
 */
export function previousShiftEnd(shifts: Shift[], staffId: string, startIso: string): string | null {
  const startMs = toMs(startIso);
  let latest: string | null = null;
  for (const s of shifts) {
    if (s.staffId !== staffId || !s.loggedOffAt) continue;
    const endMs = toMs(s.loggedOffAt);
    if (endMs <= startMs && (latest === null || endMs > toMs(latest))) {
      latest = s.loggedOffAt;
    }
  }
  return latest;
}
