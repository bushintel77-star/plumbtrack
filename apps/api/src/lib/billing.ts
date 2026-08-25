export const RATE_STANDARD = 145;
export const CALLOUT_FEE = 85;
export const GST_RATE = 0.1;

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export interface BillableEntry {
  start: Date | string;
  end: Date | string | null;
}

export function totalBilledSeconds(entries: BillableEntry[], runningSeconds = 0): number {
  const closed = entries.reduce((sum, entry) => {
    if (!entry.end) return sum;
    const start = new Date(entry.start).getTime();
    const end = new Date(entry.end).getTime();
    return sum + (end - start) / 1000;
  }, 0);
  return closed + runningSeconds;
}

export function labourTotal(billedSeconds: number): number {
  return Math.max(1, billedSeconds / 3600) * RATE_STANDARD;
}

export function invoiceTotal(billedSeconds: number): number {
  return labourTotal(billedSeconds) + CALLOUT_FEE;
}

export function quoteSubtotal(lines: { qty: number; rate: number }[]): number {
  return lines.reduce((sum, line) => sum + line.qty * line.rate, 0);
}

export function gstAmount(exGst: number): number {
  return exGst * GST_RATE;
}

export function incGst(exGst: number): number {
  return exGst * (1 + GST_RATE);
}
