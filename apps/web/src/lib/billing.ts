import { CALLOUT_FEE, GST_RATE, RATE_STANDARD } from "./constants";

// Re-export business constants for consumers that import from billing.
export { CALLOUT_FEE, RATE_STANDARD, GST_RATE };
import type { Job, TimeEntry, QuoteLine } from "@/types";
import type { JobStatus } from "@/types";

// ── Time ─────────────────────────────────────────────────────────────────────

/** Sum closed time entries (end != null) into whole seconds. */
export function totalClosedSeconds(entries: TimeEntry[]): number {
  return entries.reduce((sum, e) => {
    if (!e.end) return sum;
    return sum + (new Date(e.end).getTime() - new Date(e.start).getTime()) / 1000;
  }, 0);
}

/** Format whole seconds as HH:MM:SS. */
export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ── Invoicing ────────────────────────────────────────────────────────────────

/** Labour charge with a 1-hour minimum. */
export function labourTotal(billedSeconds: number): number {
  return Math.max(1, billedSeconds / 3600) * RATE_STANDARD;
}

/** Labour + callout fee. */
export function invoiceTotal(billedSeconds: number): number {
  return labourTotal(billedSeconds) + CALLOUT_FEE;
}

// ── Quotes ───────────────────────────────────────────────────────────────────

export function quoteSubtotal(lines: QuoteLine[]): number {
  return lines.reduce((s, l) => s + l.qty * l.rate, 0);
}

export function gstAmount(exGst: number): number {
  return exGst * GST_RATE;
}

export function incGst(exGst: number): number {
  return exGst * (1 + GST_RATE);
}

// ── Status derivation ───────────────────────────────────────────────────────

/** Derive job status from the time record. A job with any open time entry
 *  is in_progress, regardless of the stored status. Scheduled/completed are
 *  set explicitly (openJob / sign-off) and used only when no one is clocked on. */
export function derivedJobStatus(job: Job): JobStatus {
  if (job.timeEntries.some((e) => e.end === null)) return "in_progress";
  return job.status;
}

// ── Job costing (quote vs actual) ───────────────────────────────────────────

export interface CostingBreakdown {
  /** Quote-estimated labour line total (ex GST). */
  quoteLabour: number;
  /** Actual labour charge from the time record. */
  actualLabour: number;
  /** Whether the job ran over the quoted estimate. */
  overBudget: boolean;
}

/** Compare a quote's labour estimate against a job's actual labour charge.
 *  Scans the quote's lines for `unit === "hr"` rows to sum the estimate;
 *  uses `labourTotal(billedSeconds)` for the actual. */
export function jobCosting(
  quoteLines: QuoteLine[] | undefined,
  billedSeconds: number,
): CostingBreakdown | null {
  if (!quoteLines || quoteLines.length === 0) return null;

  const quoteLabour = quoteLines
    .filter((l) => l.unit === "hr")
    .reduce((s, l) => s + l.qty * l.rate, 0);

  const actualLabour = labourTotal(billedSeconds);

  return {
    quoteLabour,
    actualLabour,
    overBudget: actualLabour > quoteLabour,
  };
}
