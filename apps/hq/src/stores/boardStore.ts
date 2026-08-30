"use client"

import { create } from "zustand"
import { useShallow } from "zustand/react/shallow"
import type {
  AssignCheck,
  Channel,
  DataMode,
  Job,
  JobStatus,
  Quote,
  SendQuoteResult,
  SlackDispatchCard,
  Technician
} from "@/types"
import { channels as seedChannels, jobs as seedJobs, technicians as seedTechs } from "@/data/seed"
import type { ApiBoardPayload } from "@/lib/adapter"
import { adaptApiBoard } from "@/lib/adapter"
import { TOTAL_BLOCKS } from "@/lib/format"
import { jobDay } from "@/lib/schedule"

/** Fleet vehicle bound to a technician (telemetry vehicleId target). */
export interface Vehicle {
  id: string
  label: string
  techId: string
}

/** High-frequency GPS ping from topic/fleet/telemetry. */
export interface LiveLocation {
  vehicleId: string
  lat: number
  lng: number
  heading: number
  speed: number
  timestamp: number
}

function keyBy<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map(item => [item.id, item]))
}

const seedVehicles: Vehicle[] = seedTechs.map(tech => ({
  id: `veh-${tech.van.toLowerCase().replace(/\s+/g, "-")}`,
  label: tech.van,
  techId: tech.id
}))

const seedJobsById = keyBy(seedJobs)

interface BoardState {
  technicians: Technician[]
  vehicles: Vehicle[]
  /** Normalized job dictionary (keyed by jobId) — O(1) lookups/updates for
   *  high-frequency telemetry mutations (research §State Management). */
  jobs: Record<string, Job>
  channels: Channel[]
  activeChannelId: string
  selectedJobId: string | null
  paletteOpen: boolean
  /** Details overlay (researched topology: selection opens an overlay). */
  detailsOpen: boolean
  /** Colourway — hardware chassis (dark) default, Soft White toggle. */
  theme: "light" | "dark"
  dataMode: DataMode
  /** Deprecated compatibility fields; never populated by live tracking. */
  liveLocations: Record<string, LiveLocation>
  liveLocationHistory: Record<string, LiveLocation[]>
  /** Test bridges: force the server-persist failure / offline paths. */
  simulateFailure: boolean
  offline: boolean

  /** Route Optimizer slide-over (research §Efficient Route). */
  optimizerOpen: boolean
  /** Slack bridge comms drawer (research §Slack FSM integration). */
  commsOpen: boolean
  /** Block-Kit-style dispatch cards posted on FSM transitions. */
  slackFeed: SlackDispatchCard[]

  selectJob: (jobId: string | null) => void
  openDetails: (jobId: string) => void
  closeDetails: () => void
  setActiveChannel: (channelId: string) => void
  setPaletteOpen: (open: boolean) => void
  setTheme: (theme: "light" | "dark") => void
  setDataMode: (mode: DataMode) => void
  setSimulateFailure: (value: boolean) => void
  setOffline: (value: boolean) => void

  /** Deprecated no-op retained for compatibility; live tracking is disabled. */
  mergeLiveLocations: (pings: LiveLocation[]) => void
  /** Apply a remote status transition from topic/jobs/status. */
  applyRemoteStatus: (jobId: string, status: JobStatus) => void

  hydrateFromApi: (payload: ApiBoardPayload) => void
  enterDemo: () => void

  canAssign: (jobId: string, techId: string, startBlock: number) => AssignCheck
  assignJob: (jobId: string, techId: string, startBlock: number) => AssignCheck
  /** Rapid status override (context menu on a block). */
  setJobStatus: (jobId: string, status: JobStatus) => void
  /**
   * Atomic multi-job placement (Route Optimizer apply): validates the FINAL
   * layout — skills, absences, board-day bounds and per-row overlaps — before
   * touching state, so a re-sequenced route never collides with itself the
   * way incremental single-job assigns would.
   */
  applyRouteStops: (
    stops: Array<{ jobId: string; techId: string; startBlock: number }>
  ) => AssignCheck

  /** Slack bridge surface. */
  setOptimizerOpen: (open: boolean) => void
  setCommsOpen: (open: boolean) => void
  postSlackCard: (card: Omit<SlackDispatchCard, "id" | "ts">) => void
  rewriteSlackCard: (
    jobId: string,
    patch: Partial<Omit<SlackDispatchCard, "id" | "ts" | "jobId">>
  ) => void
  /** Temporary incident channel per on-site job (#job-{id}), archived on completion. */
  spinUpJobChannel: (jobId: string, title: string) => void
  archiveJobChannel: (jobId: string) => void

  /** Single-Active-State Enforcer (BR-01): clocking on demotes every other
   *  active job on the same technician row and restarts the timer at zero. */
  clockOn: (jobId: string) => { demoted: string[] }
  clockOff: (jobId: string) => void
  tick: () => void

  markQuoteSent: (jobId: string) => SendQuoteResult
  markQuoteApproved: (jobId: string) => SendQuoteResult
  setQuoteClient: (jobId: string, clientName: string) => void
  addQuoteLineItem: (jobId: string) => void

  postMessage: (channelId: string, body: string) => void

  /** Snapshot/restore for optimistic rollback (BR-07). */
  snapshotJobs: () => void
  rollbackJobs: () => void

  /** Self-healing reset hooks used by the Playwright suite. */
  healTimer: (jobId: string) => void
  forceQuoteDraft: (jobId: string) => void
}

function patchJob(
  jobs: Record<string, Job>,
  jobId: string,
  patch: Partial<Job>
): Record<string, Job> {
  const current = jobs[jobId]
  if (!current) return jobs
  return { ...jobs, [jobId]: { ...current, ...patch } }
}

function patchQuote(
  jobs: Record<string, Job>,
  jobId: string,
  patch: Partial<Quote>
): Record<string, Job> {
  const current = jobs[jobId]
  if (!current) return jobs
  return { ...jobs, [jobId]: { ...current, quote: { ...current.quote, ...patch } } }
}

export function missingQuoteFields(quote: Quote): string[] {
  const missing: string[] = []
  if (!quote.clientName || !quote.clientName.trim()) missing.push("client name")
  if (!quote.lineItems || quote.lineItems.length === 0) missing.push("line items")
  return missing
}

// Rollback state belongs to the store instance rather than a module-global mutable slot.
let rollbackSnapshot: Record<string, Job> | null = null

export const useBoardStore = create<BoardState>()((set, get) => ({
  technicians: seedTechs,
  vehicles: seedVehicles,
  jobs: seedJobsById,
  channels: seedChannels,
  activeChannelId: "general",
  selectedJobId: "j-1001",
  paletteOpen: false,
  detailsOpen: false,
  theme: "dark",
  dataMode: "connecting",
  liveLocations: {},
  liveLocationHistory: {},
  simulateFailure: false,
  offline: false,
  optimizerOpen: false,
  commsOpen: false,
  slackFeed: [],

  selectJob: jobId => set({ selectedJobId: jobId }),

  openDetails: jobId => set({ selectedJobId: jobId, detailsOpen: true }),

  closeDetails: () => set({ detailsOpen: false }),

  setActiveChannel: channelId =>
    set(s => ({
      activeChannelId: channelId,
      channels: s.channels.map(c =>
        c.id === channelId ? { ...c, unread: 0 } : c
      )
    })),

  setPaletteOpen: open => set({ paletteOpen: open }),

  setTheme: theme => {
    set({ theme })
    try {
      window.localStorage.setItem("hq-theme", theme)
    } catch {
      // Private mode etc. — theme just won't persist.
    }
  },

  setDataMode: mode => set({ dataMode: mode }),
  setSimulateFailure: value => set({ simulateFailure: value }),
  setOffline: value => set({ offline: value }),

  mergeLiveLocations: _pings => {
    // Deliberately no-op: continuous technician location ingestion is disabled.
  },

  applyRemoteStatus: (jobId, status) =>
    set(s => ({
      jobs: patchJob(s.jobs, jobId, {
        status,
        timerRunning: status === "active"
      })
    })),

  hydrateFromApi: payload =>
    set(s => ({
      ...adaptApiBoard(payload, s.technicians),
      dataMode: "live"
    })),

  enterDemo: () =>
    set(s => ({
      dataMode: "demo",
      // Keep whatever the dispatcher already arranged locally; the seed only
      // fills an empty board so a network blip never wipes in-progress work.
      jobs: Object.keys(s.jobs).length > 0 ? s.jobs : seedJobsById
    })),

  canAssign: (jobId, techId, startBlock) => {
    const current = get().jobs[jobId]
    const tech = get().technicians.find(t => t.id === techId)
    if (!current) return { ok: false, reason: "Job not found." }
    if (!tech) return { ok: false, reason: "Technician not found." }
    const day = jobDay(current)
    const absence = tech.absences.find(a => day >= a.from && day <= a.to)
    if (absence) {
      return {
        ok: false,
        reason: `${tech.name.split(" ")[0]} is on approved leave (${absence.reason.toLowerCase()}) for this window.`
      }
    }
    if (current.requiredSkill && !tech.skills.includes(current.requiredSkill)) {
      return {
        ok: false,
        reason: `${tech.name.split(" ")[0]} lacks the ${current.requiredSkill} skill this job requires.`
      }
    }
    const span = current.spanBlocks
    const boundedStart = Math.max(0, Math.min(startBlock, TOTAL_BLOCKS - span))
    const conflict = Object.values(get().jobs).find(
      job =>
        job.id !== jobId &&
        job.techId === techId &&
        job.status !== "complete" &&
        (job.scheduledDate ?? "") === (current.scheduledDate ?? "") &&
        boundedStart < job.startBlock + job.spanBlocks &&
        boundedStart + span > job.startBlock
    )
    if (conflict) return { ok: false, reason: `Slot conflicts with ${conflict.title}.` }
    return { ok: true }
  },

  assignJob: (jobId, techId, startBlock) => {
    const check = get().canAssign(jobId, techId, startBlock)
    if (!check.ok) return check
    const current = get().jobs[jobId]
    const span = current?.spanBlocks ?? 1
    set(s => ({
      jobs: patchJob(s.jobs, jobId, {
        techId,
        startBlock: Math.max(0, Math.min(startBlock, TOTAL_BLOCKS - span)),
        status: "scheduled"
      })
    }))
    return { ok: true }
  },

  applyRouteStops: stops => {
    const s = get()
    // Materialize the complete final layout first — untouched same-day jobs
    // stay in place and must not be overlapped by the re-sequenced route.
    const next = { ...s.jobs }
    for (const stop of stops) {
      const job = next[stop.jobId]
      const tech = s.technicians.find(t => t.id === stop.techId)
      if (!job) return { ok: false, reason: `Job ${stop.jobId} not found.` }
      if (!tech) return { ok: false, reason: `Technician ${stop.techId} not found.` }
      const day = job.scheduledDate ?? new Date().toISOString().slice(0, 10)
      const absence = tech.absences.find(a => day >= a.from && day <= a.to)
      if (absence) {
        return {
          ok: false,
          reason: `${tech.name.split(" ")[0]} is on approved leave for this window.`
        }
      }
      if (job.requiredSkill && !tech.skills.includes(job.requiredSkill)) {
        return {
          ok: false,
          reason: `${tech.name.split(" ")[0]} lacks the ${job.requiredSkill} skill.`
        }
      }
      const start = Math.max(0, Math.min(stop.startBlock, TOTAL_BLOCKS - job.spanBlocks))
      next[stop.jobId] = {
        ...job,
        techId: stop.techId,
        startBlock: start,
        status: job.techId ? job.status : "scheduled"
      }
    }
    // Overlap check per technician across the final layout (BR-04).
    for (const stop of stops) {
      const moved = next[stop.jobId]
      const clash = Object.values(next).find(
        j =>
          j.id !== moved.id &&
          j.techId === moved.techId &&
          j.status !== "complete" &&
          (j.scheduledDate ?? "") === (moved.scheduledDate ?? "") &&
          moved.startBlock < j.startBlock + j.spanBlocks &&
          moved.startBlock + moved.spanBlocks > j.startBlock
      )
      if (clash) {
        return { ok: false, reason: `Route overlaps ${clash.title} on this row.` }
      }
    }
    set({ jobs: next })
    return { ok: true }
  },

  setOptimizerOpen: open => set({ optimizerOpen: open }),
  setCommsOpen: open => set({ commsOpen: open }),

  postSlackCard: card =>
    set(s => ({
      slackFeed: [
        {
          ...card,
          id: `sc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          ts: Date.now()
        },
        ...s.slackFeed
      ].slice(0, 60)
    })),

  rewriteSlackCard: (jobId, patch) =>
    set(s => ({
      slackFeed: s.slackFeed.map(card =>
        card.jobId === jobId ? { ...card, ...patch } : card
      )
    })),

  spinUpJobChannel: (jobId, title) =>
    set(s => {
      const id = `job-${jobId}`
      if (s.channels.some(c => c.id === id)) return s
      return {
        channels: [
          ...s.channels,
          {
            id,
            name: id,
            unread: 1,
            messages: [
              {
                id: `m-${id}-open`,
                author: "PlumbTrack",
                body: `Incident channel opened for “${title}” — field notes, parts and photos thread here. Customer tracking stays on the FSM job.`,
                minutesAgo: 0
              }
            ]
          }
        ]
      }
    }),

  archiveJobChannel: jobId =>
    set(s => ({
      channels: s.channels.map(c =>
        c.id === `job-${jobId}` && !c.archived
          ? {
              ...c,
              archived: true,
              messages: [
                ...c.messages,
                {
                  id: `m-${c.id}-archive`,
                  author: "PlumbTrack",
                  body: "Job completed — field notes and parts synced to the FSM record. Channel archived.",
                  minutesAgo: 0
                }
              ]
            }
          : c
      )
    })),

  clockOn: jobId => {
    const job = get().jobs[jobId]
    if (!job || !job.techId || job.status === "complete") return { demoted: [] }

    const demoted: string[] = []
    set(s => {
      const next: Record<string, Job> = {}
      for (const [id, j] of Object.entries(s.jobs)) {
        if (id === jobId) {
          next[id] = {
            ...j,
            status: "active",
            timerRunning: true,
            // Fresh clock-on always restarts from zero.
            elapsedSeconds: 0,
            clockOnCount: j.clockOnCount + 1
          }
        } else if (j.techId === job.techId && j.status === "active") {
          demoted.push(id)
          next[id] = { ...j, status: "scheduled", timerRunning: false }
        } else {
          next[id] = j
        }
      }
      return { jobs: next }
    })
    return { demoted }
  },

  clockOff: jobId =>
    set(s => ({
      jobs: patchJob(s.jobs, jobId, { status: "complete", timerRunning: false })
    })),

  setJobStatus: (jobId, status) =>
    set(s => ({
      jobs: patchJob(s.jobs, jobId, { status, timerRunning: status === "active" })
    })),

  tick: () =>
    set(s => {
      let changed = false
      const next: Record<string, Job> = {}
      for (const [id, j] of Object.entries(s.jobs)) {
        if (j.timerRunning) {
          changed = true
          next[id] = { ...j, elapsedSeconds: j.elapsedSeconds + 1 }
        } else {
          next[id] = j
        }
      }
      return changed ? { jobs: next } : s
    }),

  markQuoteSent: jobId => {
    const job = get().jobs[jobId]
    if (!job) return { ok: false, reason: "Job not found." }
    const missing = missingQuoteFields(job.quote)
    if (missing.length > 0) {
      return {
        ok: false,
        reason: `Blocked from SENT — missing ${missing.join(" and ")}.`
      }
    }
    set(s => ({ jobs: patchQuote(s.jobs, jobId, { status: "sent" }) }))
    return { ok: true }
  },

  markQuoteApproved: jobId => {
    const job = get().jobs[jobId]
    if (!job) return { ok: false, reason: "Job not found." }
    if (job.quote.status !== "sent") {
      return { ok: false, reason: "Only a SENT quote can be approved." }
    }
    set(s => ({ jobs: patchQuote(s.jobs, jobId, { status: "approved" }) }))
    return { ok: true }
  },

  setQuoteClient: (jobId, clientName) =>
    set(s => ({ jobs: patchQuote(s.jobs, jobId, { clientName }) })),

  addQuoteLineItem: jobId =>
    set(s => {
      const job = s.jobs[jobId]
      if (!job) return s
      const items = job.quote.lineItems ?? []
      return {
        jobs: {
          ...s.jobs,
          [jobId]: {
            ...job,
            quote: {
              ...job.quote,
              lineItems: [
                ...items,
                {
                  id: `li-${Date.now()}`,
                  description: "New line item",
                  qty: 1,
                  unitPrice: 0
                }
              ]
            }
          }
        }
      }
    }),

  postMessage: (channelId, body) =>
    set(s => ({
      channels: s.channels.map(c =>
        c.id === channelId
          ? {
              ...c,
              messages: [
                ...c.messages,
                { id: `m-${Date.now()}`, author: "HQ", body, minutesAgo: 0 }
              ]
            }
          : c
      )
    })),

  snapshotJobs: () => {
    rollbackSnapshot = get().jobs
  },

  rollbackJobs: () => {
    if (rollbackSnapshot) set({ jobs: rollbackSnapshot })
  },

  healTimer: jobId => {
    const job = get().jobs[jobId]
    set(s => ({
      jobs: patchJob(s.jobs, jobId, {
        elapsedSeconds: 0,
        timerRunning: false,
        status: job && !job.techId ? "unassigned" : "scheduled"
      })
    }))
  },

  forceQuoteDraft: jobId =>
    set(s => ({ jobs: patchQuote(s.jobs, jobId, { status: "draft" }) }))
}))

/** List selector over the normalized dictionary (stable via shallow). */
export function useJobsList(): Job[] {
  return useBoardStore(useShallow(s => Object.values(s.jobs)))
}

// Test bridge: Playwright dispatches self-healing resets + failure simulation
// through this handle.
if (typeof window !== "undefined" && (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_HQ_TEST_BRIDGE === "1")) {
  ;(window as unknown as { __hqStore: typeof useBoardStore }).__hqStore = useBoardStore
}
