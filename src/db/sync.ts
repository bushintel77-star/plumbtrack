import { synchronize } from "@nozbe/watermelondb/sync"

import { config } from "@/lib/config"
import { getSession, enrollDeviceSession } from "@/lib/auth"
import { database } from "./database"
import { JobRow } from "./JobRow"
import type { Job } from "@/types"

/**
 * WatermelonDB synchronize — pull-only by design (approved): the local DB
 * is the offline cache of the board; writes keep the outbox (opId
 * idempotency, discard-rollback), so pushChanges is a no-op. Full two-way
 * sync needs server tombstones first (see README roadmap).
 *
 * The endpoint speaks the Watermelon sync contract:
 *   GET /api/sync?last_pulled_at= → { changes: { jobs: { created, updated, deleted } }, timestamp }
 */

interface SyncResponse {
  changes: {
    jobs: {
      created: Record<string, unknown>[]
      updated: Record<string, unknown>[]
      deleted: string[]
    }
  }
  timestamp: number
}

/** Map an API/Watermelon row to the domain Job. */
function rowToJob(raw: Record<string, unknown>): Job {
  const entries = (raw.time_entries ?? raw.timeEntries) as Job["timeEntries"] | string | undefined
  const rawChecklist = (raw.checklists ?? raw.checklist_items) as Array<Record<string, unknown>> | string | undefined
  const checklists = Array.isArray(rawChecklist)
    ? rawChecklist.map(item => ({
        id: String(item.id),
        label: String(item.label),
        sortOrder: Number(item.sortOrder ?? item.sort_order ?? 0),
        completedAt: (item.completedAt ?? item.completed_at ?? null) as string | null,
        completedBy: (item.completedBy ?? item.completed_by ?? null) as string | null
      }))
    : typeof rawChecklist === "string"
      ? (JSON.parse(rawChecklist) as Job["checklists"])
      : []
  return {
    id: String(raw.id),
    client: String(raw.client ?? "Unknown client"),
    address: String(raw.address ?? ""),
    scope: String(raw.scope ?? ""),
    phone: typeof raw.phone === "string" ? raw.phone : undefined,
    accessCode: typeof raw.access_code === "string" ? raw.access_code : (raw.accessCode as string | undefined),
    jobType: (raw.job_type ?? raw.jobType) as Job["jobType"],
    status: (raw.status ?? "scheduled") as Job["status"],
    checklists,
    timeEntries: typeof entries === "string" ? (JSON.parse(entries) as Job["timeEntries"]) : (entries ?? []),
    photos: [],
    serviceItems: []
  }
}

/** Map a domain Job to Watermelon raw columns. */
export function jobToRaw(job: Job): Record<string, unknown> {
  return {
    id: job.id,
    client: job.client,
    address: job.address,
    scope: job.scope,
    phone: job.phone ?? null,
    access_code: job.accessCode ?? null,
    job_type: job.jobType ?? null,
    status: job.status,
    checklists: JSON.stringify(job.checklists ?? []),
    time_entries: JSON.stringify(job.timeEntries ?? [])
  }
}

/** Read the entire cached board (boot hydration, offline reads). */
export async function readCachedJobs(): Promise<Job[]> {
  const rows = await database.get<JobRow>("jobs").query().fetch()
  return rows.map(row => rowToJob(row._raw))
}

/** Upsert jobs into the cache — after an API fetch or a live frame. */
export async function cacheJobs(jobs: Job[]): Promise<void> {
  if (jobs.length === 0) return
  await database.write(async () => {
    const collection = database.get<JobRow>("jobs")
    for (const job of jobs) {
      const existing = await collection.find(job.id).catch(() => null)
      if (existing) {
        await existing.update(record => {
          record.client = job.client
          record.address = job.address ?? null
          record.scope = job.scope ?? null
          record.phone = job.phone ?? null
          record.accessCode = job.accessCode ?? null
          record.jobType = job.jobType ?? null
          record.status = job.status
          record.checklists = job.checklists ?? []
          record.timeEntries = job.timeEntries ?? []
        })
      } else {
        await collection.create(record => {
          record._raw.id = job.id
          record.client = job.client
          record.address = job.address ?? null
          record.scope = job.scope ?? null
          record.phone = job.phone ?? null
          record.accessCode = job.accessCode ?? null
          record.jobType = job.jobType ?? null
          record.status = job.status
          record.checklists = job.checklists ?? []
          record.timeEntries = job.timeEntries ?? []
        })
      }
    }
  })
}

/** Pull server state into the local DB via the Watermelon sync protocol. */
export async function syncJobs(): Promise<void> {
  if (config.forceDemo) return // demo mode: no backend, cache-only
  await synchronize({
    database,
    pullChanges: async ({ lastPulledAt }) => {
      let session = await getSession()
      if (!session) session = await enrollDeviceSession()
      if (!session) throw new Error("no session")
      const url = `${config.apiUrl}/api/sync${lastPulledAt ? `?last_pulled_at=${Math.round(lastPulledAt / 1000)}` : ""}`
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.token}`, "x-organization-id": config.orgId }
      })
      if (!res.ok) throw new Error(`sync ${res.status}`)
      return (await res.json()) as SyncResponse
    },
    pushChanges: async () => {
      /* pull-only by design — writes flow through the outbox */
    },
    sendCreatedAsUpdated: true,
    migrationsEnabledAtVersion: 1
  })
}
