import { useSyncExternalStore } from "react"

import { config } from "@/lib/config"
import { demoJobs } from "@/lib/demo"
import { listJobs } from "@/lib/api"
import { cacheJobs, readCachedJobs, syncJobs } from "@/db/sync"
import { loadOutbox, subscribeOutbox } from "@/lib/outbox"
import { subscribeSync } from "@/lib/syncManager"
import type { Job, OutboxOperation, Shift, ShiftWorkType } from "@/types"

// ── Shift (MA000036) — an XState v5 statechart owns the transitions; the
// store is its data mirror. The UI can never drive an illegal sequence
// (no break without a shift, no double log-on, log-off from any state). ──

import type { ShiftActor } from "@/lib/shiftPersistence"
import { hapticShiftCommitted } from "@/lib/haptics"

/**
 * Field-day store — one small hand-rolled store (Zustand-free for v1):
 * jobs, the active shift, and the outbox/sync mirrors. Every data screen
 * reads from here so offline/queued/synced states render consistently.
 */

export type LiveConnectionState = "connecting" | "live" | "offline"

export interface FieldState {
  jobs: Job[]
  jobsLoadedAt: string | null
  jobsError: string | null
  shift: Shift | null
  shifts: Shift[]
  outbox: OutboxOperation[]
  lastSyncedAt: string | null
  flushing: boolean
  live: LiveConnectionState
}

let state: FieldState = {
  jobs: config.forceDemo ? demoJobs : [],
  jobsLoadedAt: null,
  jobsError: null,
  shift: null,
  shifts: [],
  outbox: [],
  lastSyncedAt: null,
  flushing: false,
  live: "connecting"
}

const listeners = new Set<() => void>()

function set(patch: Partial<FieldState>): void {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

export function getFieldState(): FieldState {
  return state
}

export function useFieldState<T>(selector: (state: FieldState) => T): T {
  return useSyncExternalStore(
    onStoreChange => {
      listeners.add(onStoreChange)
      return () => listeners.delete(onStoreChange)
    },
    () => selector(state),
    () => selector(state)
  )
}

// ── Jobs — local-first (WatermelonDB cache under everything) ────────────────

/** Boot hydration: the cached board renders before any network moves.
 *  Offline with a prior sync = the day's jobs are already on screen. */
export async function hydrateJobsFromDb(): Promise<void> {
  try {
    const cached = await readCachedJobs()
    if (cached.length > 0) set({ jobs: cached, jobsLoadedAt: new Date().toISOString() })
  } catch {
    // Cache read must never block boot.
  }
}

/** Pull the board: synchronize() into the local DB, then read back. Falls
 *  back to the plain REST pull (and caches it) when the sync endpoint is
 *  unreachable — the cache stays the single source for the UI. */
export async function refreshJobs(): Promise<void> {
  if (config.forceDemo) {
    set({ jobs: demoJobs, jobsLoadedAt: new Date().toISOString(), jobsError: null })
    void cacheJobs(demoJobs).catch(() => {})
    return
  }
  try {
    await syncJobs()
    set({ jobs: await readCachedJobs(), jobsLoadedAt: new Date().toISOString(), jobsError: null })
  } catch {
    try {
      const jobs = await listJobs()
      await cacheJobs(jobs)
      set({ jobs: await readCachedJobs(), jobsLoadedAt: new Date().toISOString(), jobsError: null })
    } catch (error) {
      set({ jobsError: error instanceof Error ? error.message : "Could not reach the API" })
    }
  }
}

export function patchJob(jobId: string, patch: Partial<Job>): void {
  set({ jobs: state.jobs.map(job => (job.id === jobId ? { ...job, ...patch } : job)) })
}

export function setLiveConnection(next: LiveConnectionState): void {
  if (state.live !== next) set({ live: next })
}

/** Write a job's current in-memory state through to the DB cache (best
 *  effort — the cache tracks the stream for offline reads). */
function writeThrough(jobId: string): void {
  const job = state.jobs.find(item => item.id === jobId)
  if (job) void cacheJobs([job]).catch(() => {})
}

/**
 * Apply one live-stream frame to the local board. Events arrive already
 * org-scoped from the verified server channel; the store keeps its
 * emergency-first ordering by re-sorting on render.
 */
export function applyLiveFrame(frame: import("@/types").LiveFrame): void {
  switch (frame.topic) {
    case "topic/jobs/created":
      if (!state.jobs.some(job => job.id === frame.job.id)) {
        set({ jobs: [...state.jobs, frame.job] })
        void cacheJobs([frame.job]).catch(() => {})
      }
      return
    case "topic/jobs/updated":
      patchJob(frame.jobId, frame.patch)
      writeThrough(frame.jobId)
      return
    case "topic/jobs/status":
      patchJob(frame.jobId, { status: frame.status })
      writeThrough(frame.jobId)
      return
    case "topic/jobs/checklist": {
      // Live checklist progress (ours echoing back or another actor): patch
      // the single item — completion evidence, not full-list replacement.
      const job = state.jobs.find(item => item.id === frame.jobId)
      if (!job?.checklists) return
      patchJob(frame.jobId, {
        checklists: job.checklists.map(item =>
          item.id === frame.itemId
            ? { ...item, completedAt: frame.completedAt, completedBy: frame.completedAt ? "field" : null }
            : item
        )
      })
      writeThrough(frame.jobId)
      return
    }
    case "topic/jobs/activity": {
      // Another actor's clock event: close any optimistic open entry on
      // that job — the authoritative list comes back with the next refresh.
      const job = state.jobs.find(item => item.id === frame.jobId)
      if (!job) return
      if (frame.activity === "clock-in" && job.timeEntries.every(entry => entry.end !== null)) {
        patchJob(frame.jobId, {
          timeEntries: [
            ...job.timeEntries,
            { id: frame.entryId, staffId: "remote", start: new Date().toISOString(), end: null, lat: null, lng: null }
          ]
        })
      } else if (frame.activity === "clock-out") {
        patchJob(frame.jobId, {
          timeEntries: job.timeEntries.map(entry =>
            entry.id === frame.entryId || entry.end === null
              ? { ...entry, end: entry.end ?? new Date().toISOString() }
              : entry
          )
        })
      }
      return
    }
    default:
      return
  }
}

let shiftActor: ShiftActor | null = null

/** Bind the durable actor at boot (root layout, before interaction). The
 *  subscriber mirrors machine snapshots into store state — the archive
 *  branch fires exactly once because LOG_ON resets the finalisation. */
export function bindShiftActor(actor: ShiftActor): void {
  shiftActor = actor
  actor.subscribe(snapshot => {
    const ctx = snapshot.context
    if (snapshot.value === "idle") {
      if (ctx.loggedOffAt && ctx.loggedOnAt) {
        const closed = {
          id: ctx.shiftId,
          staffId: "staff-1",
          workType: ctx.workType,
          loggedOnAt: ctx.loggedOnAt,
          loggedOffAt: ctx.loggedOffAt,
          breaks: ctx.breaks,
          trackingNoticeAckAt: ctx.loggedOnAt,
          logOnLat: ctx.logOnLat,
          logOnLng: ctx.logOnLng,
          kmDriven: ctx.kmDriven,
          toilElection: ctx.toilElection
        }
        set({ shift: null, shifts: [...state.shifts, closed] })
      } else if (state.shift) {
        set({ shift: null })
      }
      return
    }
    set({
      shift: {
        id: ctx.shiftId,
        staffId: "staff-1",
        workType: ctx.workType,
        loggedOnAt: ctx.loggedOnAt ?? new Date().toISOString(),
        loggedOffAt: null,
        breaks: ctx.breaks,
        trackingNoticeAckAt: ctx.loggedOnAt,
        logOnLat: ctx.logOnLat,
        logOnLng: ctx.logOnLng
      }
    })
  })
}

export function logOnShift(workType: ShiftWorkType, coords: { lat: number | null; lng: number | null }): void {
  shiftActor?.send({ type: "LOG_ON", workType, lat: coords.lat, lng: coords.lng })
  hapticShiftCommitted.logOn()
}

export function startBreak(): void {
  shiftActor?.send({ type: "START_BREAK" })
  hapticShiftCommitted.breakStart()
}

export function endBreak(): void {
  shiftActor?.send({ type: "END_BREAK" })
  hapticShiftCommitted.breakEnd()
}

export function logOffShift(kmDriven?: number, toilElection?: boolean): void {
  shiftActor?.send({ type: "LOG_OFF", kmDriven, toilElection })
  hapticShiftCommitted.logOff()
}

// ── Outbox / sync mirrors ───────────────────────────────────────────────────

export function attachOutboxMirror(): () => void {
  const pushOps = async () => set({ outbox: [...(await loadOutbox())] })
  void pushOps()
  const unsubscribeOps = subscribeOutbox(pushOps)
  const unsubscribeSync = subscribeSync(syncState =>
    set({ lastSyncedAt: syncState.lastSyncedAt, flushing: syncState.flushing })
  )
  return () => {
    unsubscribeOps()
    unsubscribeSync()
  }
}
