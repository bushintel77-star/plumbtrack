import { create } from 'zustand'
import type {
  Channel,
  Job,
  Quote,
  SendQuoteResult,
  Technician
} from '@/types'
import { channels as seedChannels, jobs as seedJobs, technicians as seedTechs } from '@/data/seed'

interface DispatchState {
  technicians: Technician[]
  jobs: Job[]
  channels: Channel[]
  activeChannelId: string
  selectedJobId: string | null
  paletteOpen: boolean

  selectJob: (jobId: string | null) => void
  setActiveChannel: (channelId: string) => void
  setPaletteOpen: (open: boolean) => void

  assignJob: (jobId: string, techId: string, startBlock: number) => { ok: boolean; reason?: string }
  /** Single-Active-State Enforcer lives here: clocking a job on demotes every
   *  other active job on the same technician row back to a muted queued state. */
  clockOn: (jobId: string) => { demoted: string[] }
  clockOff: (jobId: string) => void
  tick: () => void

  markQuoteSent: (jobId: string) => SendQuoteResult
  markQuoteApproved: (jobId: string) => SendQuoteResult
  setQuoteClient: (jobId: string, clientName: string) => void
  addQuoteLineItem: (jobId: string) => void

  postMessage: (channelId: string, body: string) => void

  /** Self-healing reset hooks used by the Playwright suite. */
  healTimer: (jobId: string) => void
  forceQuoteDraft: (jobId: string) => void
}

function patchJob(jobs: Job[], jobId: string, patch: Partial<Job>): Job[] {
  return jobs.map((j) => (j.id === jobId ? { ...j, ...patch } : j))
}

function patchQuote(jobs: Job[], jobId: string, patch: Partial<Quote>): Job[] {
  return jobs.map((j) =>
    j.id === jobId ? { ...j, quote: { ...j.quote, ...patch } } : j
  )
}

export function missingQuoteFields(quote: Quote): string[] {
  const missing: string[] = []
  if (!quote.clientName || !quote.clientName.trim()) missing.push('client name')
  if (!quote.lineItems || quote.lineItems.length === 0) missing.push('line items')
  return missing
}

export const useDispatchStore = create<DispatchState>()((set, get) => ({
  technicians: seedTechs,
  jobs: seedJobs,
  channels: seedChannels,
  activeChannelId: 'general',
  selectedJobId: 'j-1001',
  paletteOpen: false,

  selectJob: (jobId) => set({ selectedJobId: jobId }),

  setActiveChannel: (channelId) =>
    set((s) => ({
      activeChannelId: channelId,
      channels: s.channels.map((c) => (c.id === channelId ? { ...c, unread: 0 } : c))
    })),

  setPaletteOpen: (open) => set({ paletteOpen: open }),

  assignJob: (jobId, techId, startBlock) => {
    const current = get().jobs.find((job) => job.id === jobId)
    const span = current?.spanBlocks ?? 1
    const boundedStart = Math.max(0, Math.min(startBlock, 20 - span))
    const conflict = get().jobs.find((job) =>
      job.id !== jobId && job.techId === techId && job.status !== 'complete' &&
      (job.scheduledDate ?? '') === (current?.scheduledDate ?? '') &&
      boundedStart < job.startBlock + job.spanBlocks && boundedStart + span > job.startBlock
    )
    if (conflict) return { ok: false, reason: `Conflicts with ${conflict.title}.` }
    set((s) => ({
      jobs: patchJob(s.jobs, jobId, {
        techId,
        startBlock: boundedStart,
        status: 'scheduled'
      })
    }))
    return { ok: true }
  },

  clockOn: (jobId) => {
    const job = get().jobs.find((j) => j.id === jobId)
    if (!job || !job.techId || job.status === 'complete') return { demoted: [] }

    const demoted: string[] = []
    set((s) => ({
      jobs: s.jobs.map((j) => {
        if (j.id === jobId) {
          return {
            ...j,
            status: 'active',
            timerRunning: true,
            // Fresh clock-on always restarts from zero.
            elapsedSeconds: 0,
            clockOnCount: j.clockOnCount + 1
          }
        }
        // Enforcer: only one pulsing timer per technician row.
        if (j.techId === job.techId && j.status === 'active') {
          demoted.push(j.id)
          return { ...j, status: 'scheduled', timerRunning: false }
        }
        return j
      })
    }))
    return { demoted }
  },

  clockOff: (jobId) =>
    set((s) => ({ jobs: patchJob(s.jobs, jobId, { status: 'complete', timerRunning: false }) })),

  tick: () =>
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.timerRunning ? { ...j, elapsedSeconds: j.elapsedSeconds + 1 } : j
      )
    })),

  markQuoteSent: (jobId) => {
    const job = get().jobs.find((j) => j.id === jobId)
    if (!job) return { ok: false, reason: 'Job not found.' }
    const missing = missingQuoteFields(job.quote)
    if (missing.length > 0) {
      return { ok: false, reason: `Blocked from SENT — missing ${missing.join(' and ')}.` }
    }
    set((s) => ({ jobs: patchQuote(s.jobs, jobId, { status: 'sent' }) }))
    return { ok: true }
  },

  markQuoteApproved: (jobId) => {
    const job = get().jobs.find((j) => j.id === jobId)
    if (!job) return { ok: false, reason: 'Job not found.' }
    if (job.quote.status !== 'sent') {
      return { ok: false, reason: 'Only a SENT quote can be approved.' }
    }
    set((s) => ({ jobs: patchQuote(s.jobs, jobId, { status: 'approved' }) }))
    return { ok: true }
  },

  setQuoteClient: (jobId, clientName) =>
    set((s) => ({ jobs: patchQuote(s.jobs, jobId, { clientName }) })),

  addQuoteLineItem: (jobId) =>
    set((s) => ({
      jobs: s.jobs.map((j) => {
        if (j.id !== jobId) return j
        const items = j.quote.lineItems ?? []
        return {
          ...j,
          quote: {
            ...j.quote,
            lineItems: [
              ...items,
              {
                id: `li-${Date.now()}`,
                description: 'New line item',
                qty: 1,
                unitPrice: 0
              }
            ]
          }
        }
      })
    })),

  postMessage: (channelId, body) =>
    set((s) => ({
      channels: s.channels.map((c) =>
        c.id === channelId
          ? {
              ...c,
              messages: [
                ...c.messages,
                { id: `m-${Date.now()}`, author: 'HQ', body, minutesAgo: 0 }
              ]
            }
          : c
      )
    })),

  healTimer: (jobId) => {
    const job = get().jobs.find((j) => j.id === jobId)
    set((s) => ({
      jobs: patchJob(s.jobs, jobId, {
        elapsedSeconds: 0,
        timerRunning: false,
        status: job && !job.techId ? 'unassigned' : 'scheduled'
      })
    }))
  },

  forceQuoteDraft: (jobId) =>
    set((s) => ({ jobs: patchQuote(s.jobs, jobId, { status: 'draft' }) }))
}))

// Test bridge: Playwright dispatches self-healing resets through this handle.
if (typeof window !== 'undefined') {
  ;(window as unknown as { __fieldloop: typeof useDispatchStore }).__fieldloop = useDispatchStore
}
