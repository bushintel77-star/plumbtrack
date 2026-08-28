import type { LineItem } from "@/types"

/** Board day runs 08:00 → 18:00 in 30-minute blocks. */
export const DAY_START_MINUTES = 8 * 60
export const TOTAL_BLOCKS = 20
export const MINUTES_PER_BLOCK = 30

export function blockLabel(index: number): string {
  const minutes = DAY_START_MINUTES + index * MINUTES_PER_BLOCK
  const h = Math.floor(minutes / 60)
  const mm = minutes % 60
  return `${h}:${mm.toString().padStart(2, "0")}`
}

export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map(n => n.toString().padStart(2, "0")).join(":")
}

export function formatMoney(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`
}

export function quoteTotal(items: LineItem[] | null): number {
  if (!items) return 0
  return items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0)
}

/** Calendar-day difference; deterministic regardless of time of day. */
export function daysUntil(isoDate: string): number {
  const target = new Date(isoDate)
  const startOfTarget = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate()
  ).getTime()
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  return Math.round((startOfTarget - startOfToday.getTime()) / 86_400_000)
}

export function daysFromNowIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

export function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric"
  })
}

/** YYYY-MM-DD for a day offset from today, at noon to dodge TZ edges. */
export function isoDay(offset: number): string {
  const value = new Date()
  value.setHours(12, 0, 0, 0)
  value.setDate(value.getDate() + offset)
  return value.toISOString().slice(0, 10)
}

export function todayIsoDay(): string {
  return isoDay(0)
}

export function dayLabel(isoDayString: string): string {
  const d = new Date(`${isoDayString}T12:00:00`)
  return d.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short"
  })
}
