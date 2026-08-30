import type {
  AttentionFlag,
  ComplianceDoc,
  DispatchStatus,
  GeoPoint,
  Job,
  Presence,
  ServiceAgreement,
  Severity,
  Technician
} from "@/types"
import { DAY_START_MINUTES, MINUTES_PER_BLOCK, TOTAL_BLOCKS } from "@/lib/format"
import { absenceFor, jobDay } from "@/lib/schedule"
import { travelMinutes } from "@/lib/travel"

/**
 * The FieldLoop derivation layer.
 *
 * Every surface — board, inspector, map, documents, CRM, reports — reads its
 * numbers from here rather than recomputing them locally, so a dispatcher and
 * a technician can never see two different answers to the same question.
 */

/** Days a document/agreement expiry is treated as "expiring soon". */
export const EXPIRY_WINDOW_DAYS = 30

// ── Status ──────────────────────────────────────────────────────────────────

/** Collapse the internal job FSM onto the four states the board speaks.
 *  Emergency priority outranks the lifecycle state, but a finished job reads
 *  complete regardless of how urgent it was. */
export function dispatchStatus(job: Pick<Job, "status" | "priority" | "techId">): DispatchStatus {
  if (job.status === "complete") return "complete"
  if (job.status === "unassigned" || !job.techId) return "unassigned"
  if (job.priority === "emergency" || job.status === "delayed") return "urgent"
  return "scheduled"
}

/** Three distinct crew states. Approved leave outranks any scheduled work so
 *  an absent technician never reads as merely idle. */
export function presenceFor(tech: Technician, jobs: Job[], day: string): Presence {
  if (absenceFor(tech, day)) return "on_leave"
  const inFlight = jobs.some(
    job =>
      job.techId === tech.id &&
      jobDay(job) === day &&
      (job.status === "active" || job.status === "en_route")
  )
  return inFlight ? "on_job" : "available"
}

// ── Needs-Attention flags ───────────────────────────────────────────────────

const SEVERITY_RANK: Record<Severity, number> = { red: 0, amber: 1, blue: 2, green: 3 }

function blockMinutes(block: number): number {
  return DAY_START_MINUTES + block * MINUTES_PER_BLOCK
}

function minutesIntoDay(at: Date): number {
  return at.getHours() * 60 + at.getMinutes()
}

/**
 * The single Needs-Attention definition (design spec §2):
 *   red   — an assigned job still open past its scheduled end time; a day in
 *           the future can never overrun, a day in the past always has
 *   amber — consecutive jobs at different addresses with less gap than the
 *           trip between them needs
 *   blue  — a job nobody is assigned to
 *
 * `now` is injected so the board, the tests and any server-side caller all
 * evaluate against the same instant.
 */
export function computeAttentionFlags(
  jobs: Job[],
  technicians: Technician[],
  day: string,
  now: Date = new Date()
): AttentionFlag[] {
  const sameDay = jobs.filter(job => jobDay(job) === day)
  const flags: AttentionFlag[] = []
  const clock = minutesIntoDay(now)
  const nowDay = isoOf(now)

  for (const job of sameDay) {
    if (!job.techId) {
      flags.push({
        id: `unassigned-${job.id}`,
        kind: "unassigned",
        severity: "blue",
        jobId: job.id,
        title: job.title,
        detail: `${job.address} — no technician assigned`
      })
      continue
    }
    if (job.status === "complete") continue
    if (day > nowDay) continue
    const endsAt = blockMinutes(job.startBlock + job.spanBlocks)
    const over = day < nowDay ? null : clock - endsAt
    if (over === null || over > 0) {
      flags.push({
        id: `overrun-${job.id}`,
        kind: "overrun",
        severity: "red",
        jobId: job.id,
        title: job.title,
        detail:
          over === null
            ? `Still open after ${day}, past its scheduled end`
            : `${over} min past its scheduled end and still open`
      })
    }
  }

  for (const tech of technicians) {
    const row = sameDay
      .filter(job => job.techId === tech.id && job.status !== "complete")
      .sort((a, b) => a.startBlock - b.startBlock)
    for (let i = 1; i < row.length; i += 1) {
      const prev = row[i - 1]
      const next = row[i]
      if (prev.address === next.address) continue
      if (!prev.location || !next.location) continue
      const gap = (next.startBlock - (prev.startBlock + prev.spanBlocks)) * MINUTES_PER_BLOCK
      const needed = travelMinutes(prev.location, next.location)
      if (needed > gap) {
        flags.push({
          id: `tight-travel-${next.id}`,
          kind: "tight-travel",
          severity: "amber",
          jobId: next.id,
          title: next.title,
          detail: `${Math.round(needed)} min drive from ${prev.title}, only ${gap} min of buffer`
        })
      }
    }
  }

  return flags.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
}

/** Worst severity present, or green when the day is clean. */
export function worstSeverity(flags: AttentionFlag[]): Severity {
  return flags.reduce<Severity>(
    (worst, flag) => (SEVERITY_RANK[flag.severity] < SEVERITY_RANK[worst] ? flag.severity : worst),
    "green"
  )
}

// ── Expiry maths (documents and agreements share it) ────────────────────────

export type ExpiryState = "expired" | "expiring" | "valid" | "on_record"

export interface ExpiryVerdict {
  state: ExpiryState
  label: string
  /** Days until expiry; null when the record has no expiry at all. */
  days: number | null
}

/** One expiry calculation for every dated record in the product. A missing
 *  expiry is an ordinary record, never an alarm. */
export function expiryVerdict(expiresAt: string | null | undefined, now: Date = new Date()): ExpiryVerdict {
  if (!expiresAt) return { state: "on_record", label: "On record", days: null }
  const target = new Date(expiresAt)
  const startOfTarget = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate())
  const startOfNow = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((startOfTarget - startOfNow) / 86_400_000)
  if (days < 0) return { state: "expired", label: "Expired", days }
  if (days <= EXPIRY_WINDOW_DAYS) return { state: "expiring", label: "Expiring soon", days }
  return { state: "valid", label: "Valid", days }
}

export function documentVerdict(doc: ComplianceDoc, now?: Date): ExpiryVerdict {
  return expiryVerdict(doc.expiresAt, now)
}

export function agreementVerdict(agreement: ServiceAgreement, now?: Date): ExpiryVerdict {
  return expiryVerdict(agreement.nextDueDate, now)
}

// ── Customers ───────────────────────────────────────────────────────────────

export interface DerivedCustomer {
  id: string
  name: string
  address: string
  jobs: Job[]
}

/** Customers are still derived by grouping job records — the spec calls out
 *  promoting this to a first-class table as a backend change. */
export function deriveCustomers(jobs: Job[]): DerivedCustomer[] {
  const byName = new Map<string, DerivedCustomer>()
  for (const job of jobs) {
    const existing = byName.get(job.client)
    if (existing) {
      existing.jobs.push(job)
      continue
    }
    byName.set(job.client, {
      id: job.client.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
      name: job.client,
      address: job.address,
      jobs: [job]
    })
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function initialsOf(name: string): string {
  return (name.match(/[A-Za-z0-9]+/g) ?? [])
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join("")
}

// ── Route ordering ──────────────────────────────────────────────────────────

export interface RoutePlanPoint extends GeoPoint {
  jobId: string | null
  label: string
}

export interface StraightLinePlan {
  order: Job[]
  /** Points to draw, starting at the technician's last known position when
   *  one was captured. */
  line: RoutePlanPoint[]
  /** Provenance of the geometry — the UI must render this verbatim and must
   *  not claim road routing the plan cannot deliver. */
  label: string
}

export const STRAIGHT_LINE_LABEL = "Straight-line distance, not road routing"

function euclidean(a: GeoPoint, b: GeoPoint): number {
  const dx = a.lng - b.lng
  const dy = a.lat - b.lat
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Greedy nearest-neighbour visit order over straight-line distance between
 * coordinates already on hand. Genuinely computable with no backend, which is
 * exactly why it must stay labelled as straight-line: it is not road distance
 * and not drive time.
 */
export function computeRouteOrder(
  techId: string,
  jobs: Job[],
  technician: Technician | undefined,
  day: string
): StraightLinePlan {
  const stops = jobs.filter(
    job => job.techId === techId && jobDay(job) === day && job.location
  )
  if (stops.length === 0) return { order: [], line: [], label: STRAIGHT_LINE_LABEL }

  const origin = technician?.lastKnownLocation
  let cursor: GeoPoint = origin ?? stops[0].location!
  const remaining = [...stops]
  const order: Job[] = []
  while (remaining.length > 0) {
    remaining.sort((a, b) => euclidean(cursor, a.location!) - euclidean(cursor, b.location!))
    const next = remaining.shift()!
    order.push(next)
    cursor = next.location!
  }

  const line: RoutePlanPoint[] = order.map(job => ({
    jobId: job.id,
    label: job.title,
    lat: job.location!.lat,
    lng: job.location!.lng
  }))
  if (origin) {
    line.unshift({
      jobId: null,
      label: "Last known position",
      lat: origin.lat,
      lng: origin.lng
    })
  }
  return { order, line, label: STRAIGHT_LINE_LABEL }
}

// ── Margin reporting ────────────────────────────────────────────────────────

export interface MarginRow {
  job: Job
  revenue: number
  /** null when the office has not recorded the real outlay. */
  cost: number | null
  margin: number | null
  /** Work that has not completed is a forecast, not settled fact. */
  estimated: boolean
}

export function jobRevenue(job: Job): number {
  return job.quote.lineItems?.reduce((sum, item) => sum + item.qty * item.unitPrice, 0) ?? 0
}

export function marginRow(job: Job): MarginRow {
  const revenue = jobRevenue(job)
  const cost = job.cost ?? null
  return {
    job,
    revenue,
    cost,
    margin: cost === null ? null : revenue - cost,
    estimated: job.status !== "complete"
  }
}

export interface MarginTotals {
  revenue: number
  /** null while any contributing cost is unknown — a partial total would
   *  overstate margin without saying so. */
  cost: number | null
  margin: number | null
  marginPercent: number | null
  /** Jobs still missing a recorded cost. */
  missingCosts: number
}

export function marginTotals(jobs: Job[]): MarginTotals {
  const rows = jobs.map(marginRow)
  const revenue = rows.reduce((sum, row) => sum + row.revenue, 0)
  const missingCosts = rows.filter(row => row.cost === null).length
  if (missingCosts > 0) {
    return { revenue, cost: null, margin: null, marginPercent: null, missingCosts }
  }
  const cost = rows.reduce((sum, row) => sum + (row.cost ?? 0), 0)
  const margin = revenue - cost
  return {
    revenue,
    cost,
    margin,
    marginPercent: revenue === 0 ? null : Math.round((margin / revenue) * 100),
    missingCosts: 0
  }
}

// ── Calendar maths for the Week and Month zooms ─────────────────────────────

function isoOf(date: Date): string {
  const copy = new Date(date)
  copy.setHours(12, 0, 0, 0)
  return copy.toISOString().slice(0, 10)
}

function parseIsoDay(day: string): Date {
  return new Date(`${day}T12:00:00`)
}

export function shiftDay(day: string, deltaDays: number): string {
  const date = parseIsoDay(day)
  date.setDate(date.getDate() + deltaDays)
  return isoOf(date)
}

/** Monday-anchored week containing `day`. */
export function weekDays(day: string): string[] {
  const date = parseIsoDay(day)
  const mondayOffset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - mondayOffset)
  return Array.from({ length: 7 }, (_, index) => {
    const cell = new Date(date)
    cell.setDate(cell.getDate() + index)
    return isoOf(cell)
  })
}

export interface MonthCell {
  /** ISO day, or null for the leading/trailing padding of the grid. Padding
   *  is rendered as honestly empty rather than filled with borrowed data. */
  day: string | null
}

/** Real calendar grid for the month containing `day` — Monday first. */
export function monthGrid(day: string): MonthCell[] {
  const date = parseIsoDay(day)
  const year = date.getFullYear()
  const month = date.getMonth()
  const first = new Date(year, month, 1, 12)
  const lead = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: MonthCell[] = Array.from({ length: lead }, () => ({ day: null }))
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push({ day: isoOf(new Date(year, month, d, 12)) })
  }
  while (cells.length % 7 !== 0) cells.push({ day: null })
  return cells
}

export function jobsOnDay(jobs: Job[], day: string): Job[] {
  return jobs.filter(job => jobDay(job) === day).sort((a, b) => a.startBlock - b.startBlock)
}

/**
 * Fraction of the visible board day that has already elapsed, or null when
 * `day` is not `today` or the clock sits outside board hours - the now-line
 * only renders where it carries meaning.
 */
export function nowLineFraction(day: string, now: Date, today: string): number | null {
  if (day !== today) return null
  const minutes = now.getHours() * 60 + now.getMinutes() - DAY_START_MINUTES
  const span = TOTAL_BLOCKS * MINUTES_PER_BLOCK
  if (minutes < 0 || minutes > span) return null
  return minutes / span
}
