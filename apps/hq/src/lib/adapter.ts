import type { Job, JobPriority, JobStatus, Quote, Technician } from "@/types"
import { DAY_START_MINUTES, isoDay, MINUTES_PER_BLOCK, TOTAL_BLOCKS } from "@/lib/format"

/**
 * Shapes returned by apps/api (see apps/api/src/schemas/job.ts, quote.ts).
 * Only the fields the board consumes are declared.
 */
export interface ApiTimeEntry {
  id: string
  staffId?: string | null
  start: string
  end: string | null
}

export interface ApiJobPhoto {
  id: string
  label: string
  url: string
  takenAt: string
}

export interface ApiJob {
  id: string
  client: string
  address: string
  scope: string
  status: "scheduled" | "in_progress" | "completed"
  timeEntries: ApiTimeEntry[]
  photos?: ApiJobPhoto[]
  createdAt: string
  /** Geocoded coordinates from the API (null until the address geocodes). */
  location?: { lat: number; lng: number } | null
  /** Server-authoritative assignment (G-1/G-2 round-trip). `null` when the
   *  job has no schedulable appointment yet. */
  appointment?: ApiAppointment | null
}

/** The schedulable appointment `/api/board` attaches to each job — the same
 *  record `PATCH /api/jobs/:id/assignment` mutates. */
export interface ApiAppointment {
  id: string
  assignedStaffId: string | null
  assignedStaffName?: string | null
  scheduledStart: string
  scheduledEnd: string | null
  status: string
}

export interface ApiQuoteLine {
  id: string
  description: string
  quantity?: number
  unitPrice?: number
}

export interface ApiQuote {
  id: string
  client: string
  status: "draft" | "sent" | "accepted"
  lines?: ApiQuoteLine[]
}

/** Org member from the board payload — a drag-assignable technician. */
export interface ApiStaffMember {
  id: string
  name: string
  role: string
  skills: string[]
}

export interface ApiBoardPayload {
  jobs: ApiJob[]
  quotes: ApiQuote[]
  /** Org roster; absent on older/demo servers (the store keeps its seed). */
  staff?: ApiStaffMember[]
}

const STATUS_MAP: Record<ApiJob["status"], JobStatus> = {
  scheduled: "scheduled",
  in_progress: "active",
  completed: "complete"
}

function elapsedFromEntries(entries: ApiTimeEntry[]): number {
  return entries.reduce((total, entry) => {
    if (!entry.end) return total
    const start = new Date(entry.start).getTime()
    const end = new Date(entry.end).getTime()
    return total + Math.max(0, (end - start) / 1000)
  }, 0)
}

function hasOpenEntry(entries: ApiTimeEntry[]): boolean {
  return entries.some(entry => !entry.end)
}

function mapQuoteStatus(status: ApiQuote["status"]): Quote["status"] {
  if (status === "sent") return "sent"
  if (status === "accepted") return "approved"
  return "draft"
}

/** Deterministic pseudo-slot so live jobs land somewhere readable on the matrix
 *  when the server has no schedulable appointment for them yet. */
function slotForIndex(index: number): { startBlock: number; spanBlocks: number } {
  const startBlock = (index * 5) % 16
  const spanBlocks = 3
  return { startBlock, spanBlocks }
}

/** Wall-clock minutes since midnight, parsed straight from the ISO string.
 *  `Appointment.scheduledStart` is a naive TIMESTAMP(3) column — Prisma
 *  serializes it with a Z suffix regardless of server timezone — so string
 *  parsing (not `new Date`) keeps board blocks timezone-stable. */
function wallClockMinutes(iso: string): number | null {
  const match = /T(\d{2}):(\d{2})/.exec(iso)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

/** Server schedule → board geometry. `null` when the job has no appointment. */
function slotFromAppointment(
  appointment: ApiAppointment | null | undefined
): { startBlock: number; spanBlocks: number; scheduledDate: string } | null {
  if (!appointment) return null
  const startMinutes = wallClockMinutes(appointment.scheduledStart)
  if (startMinutes === null) return null
  const startBlock = Math.max(
    0,
    Math.min(TOTAL_BLOCKS - 1, Math.round((startMinutes - DAY_START_MINUTES) / MINUTES_PER_BLOCK))
  )
  const endMinutes = appointment.scheduledEnd ? wallClockMinutes(appointment.scheduledEnd) : null
  const spanBlocks =
    endMinutes !== null && endMinutes > startMinutes
      ? Math.max(1, Math.min(TOTAL_BLOCKS - startBlock, Math.round((endMinutes - startMinutes) / MINUTES_PER_BLOCK)))
      : 1
  return { startBlock, spanBlocks, scheduledDate: appointment.scheduledStart.slice(0, 10) }
}

/** The server-authoritative assignee when it resolves to a known board
 *  technician (id match first, then name); round-robin keeps unassigned or
 *  unknown-staff jobs legible on the matrix. */
function techForJob(apiJob: ApiJob, technicians: Technician[], index: number): Technician | undefined {
  const appointment = apiJob.appointment
  if (appointment?.assignedStaffId) {
    const byId = technicians.find(tech => tech.id === appointment.assignedStaffId)
    if (byId) return byId
  }
  if (appointment?.assignedStaffName) {
    const name = appointment.assignedStaffName.toLowerCase()
    const byName = technicians.find(tech => tech.name.toLowerCase() === name)
    if (byName) return byName
  }
  return technicians.length > 0 ? technicians[index % technicians.length] : undefined
}

/** Map API entities onto board view models. The server-authoritative assignee
 *  (`appointment.assignedStaffId` / `assignedStaffName`) wins when it resolves
 *  to a known technician; otherwise round-robin keeps the matrix legible.
 *  Jobs without a schedulable appointment fall back to deterministic
 *  pseudo-slots on today's board. Returns the normalized dictionary the store
 *  consumes. */
export function adaptApiBoard(
  payload: ApiBoardPayload,
  technicians: Technician[]
): { jobs: Record<string, Job> } {  const jobs: Job[] = payload.jobs.map((apiJob, index) => {
    const tech = techForJob(apiJob, technicians, index)
    const slot = slotFromAppointment(apiJob.appointment) ?? { ...slotForIndex(index), scheduledDate: isoDay(0) }
    const apiQuote = payload.quotes.find(q => q.client === apiJob.client)
    const running = hasOpenEntry(apiJob.timeEntries)
    const quote: Quote = apiQuote
      ? {
        clientName: apiQuote.client,
        lineItems:
          apiQuote.lines && apiQuote.lines.length > 0
            ? apiQuote.lines.map(line => ({
              id: line.id,
              description: line.description,
              qty: line.quantity ?? 1,
              unitPrice: line.unitPrice ?? 0
            }))
            : null,
        status: mapQuoteStatus(apiQuote.status)
      }
      : { clientName: apiJob.client, lineItems: null, status: "draft" }
    return {
      id: apiJob.id,
      title: apiJob.scope,
      client: apiJob.client,
      address: apiJob.address,
      priority: "normal" as JobPriority,
      techId: tech?.id ?? null,
      startBlock: slot.startBlock,
      spanBlocks: slot.spanBlocks,
      scheduledDate: slot.scheduledDate,
      status: STATUS_MAP[apiJob.status],
      elapsedSeconds: Math.floor(elapsedFromEntries(apiJob.timeEntries)),
      timerRunning: running,
      clockOnCount: apiJob.timeEntries.length,
      quote,
      documents: [],
      location: apiJob.location ?? undefined,
      photos: (apiJob.photos ?? []).map(photo => ({
        id: photo.id,
        label: photo.label,
        url: photo.url,
        takenAt: photo.takenAt
      }))
    }
  })
  return { jobs: Object.fromEntries(jobs.map(job => [job.id, job])) }
}

/** Org roster → board technicians. Real staff ids are what the assignment
 *  endpoint validates (409 otherwise), so replacing the seed roster on live
 *  hydration is what makes drag-to-assign work against a real org. Van labels
 *  are cosmetic roster-order display; skills come from the membership (BR-04
 *  drag constraint). A previously-seen last-known telemetry fix is carried
 *  over by id. Absence windows stay empty until the API models them. */
export function adaptStaffRoster(
  payload: ApiBoardPayload,
  previous: Technician[]
): Technician[] {
  if (!payload.staff || payload.staff.length === 0) return previous
  return payload.staff.map((member, index) => {
    const prior = previous.find(tech => tech.id === member.id)
    return {
      id: member.id,
      name: member.name,
      van: `Van ${index + 1}`,
      skills: member.skills,
      role: "Technician" as const,
      absences: [],
      ...(prior?.lastKnownLocation ? { lastKnownLocation: prior.lastKnownLocation } : {})
    }
  })
}

/** Fetch everything the board needs in a single round-trip (G-1 endpoint).
 *  Throws NetworkError/HttpError upward so the hydration hook can fall back
 *  to demo mode. */
export async function fetchBoardPayload(): Promise<ApiBoardPayload> {
  const { apiGet } = await import("@/lib/api")
  return apiGet<ApiBoardPayload>("/api/board")
}
