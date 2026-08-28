import type { Job, JobPriority, JobStatus, Quote, Technician } from "@/types"
import { isoDay } from "@/lib/format"

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

export interface ApiJob {
  id: string
  client: string
  address: string
  scope: string
  status: "scheduled" | "in_progress" | "completed"
  timeEntries: ApiTimeEntry[]
  createdAt: string
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

export interface ApiBoardPayload {
  jobs: ApiJob[]
  quotes: ApiQuote[]
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
 *  until the board day-view feed (gap G-1) provides real scheduling windows. */
function slotForIndex(index: number): { startBlock: number; spanBlocks: number } {
  const startBlock = (index * 5) % 16
  const spanBlocks = 3
  return { startBlock, spanBlocks }
}

/** Map API entities onto board view models. Technicians stay seeded for now —
 *  the resource skill matrix is gap G-3; round-robin assignment keeps the
 *  matrix legible without inventing server-side assignments the API lacks.
 *  Returns the normalized dictionary the store consumes. */
export function adaptApiBoard(
  payload: ApiBoardPayload,
  technicians: Technician[]
): { jobs: Record<string, Job> } {
  const jobs: Job[] = payload.jobs.map((apiJob, index) => {
    const tech = technicians[index % technicians.length]
    const { startBlock, spanBlocks } = slotForIndex(index)
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
      techId: tech.id,
      startBlock,
      spanBlocks,
      scheduledDate: isoDay(0),
      status: STATUS_MAP[apiJob.status],
      elapsedSeconds: Math.floor(elapsedFromEntries(apiJob.timeEntries)),
      timerRunning: running,
      clockOnCount: apiJob.timeEntries.length,
      quote,
      documents: []
    }
  })
  return { jobs: Object.fromEntries(jobs.map(job => [job.id, job])) }
}

/** Fetch everything the board needs. Throws NetworkError/HttpError upward so
 *  the hydration hook can fall back to demo mode. */
export async function fetchBoardPayload(): Promise<ApiBoardPayload> {
  const { apiGet } = await import("@/lib/api")
  const [jobs, quotes] = await Promise.all([
    apiGet<ApiJob[]>("/api/jobs"),
    apiGet<ApiQuote[]>("/api/quotes")
  ])
  return { jobs, quotes }
}
