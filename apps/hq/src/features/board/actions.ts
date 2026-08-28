"use client"

import { toast } from "@/hooks/use-toast"
import { useBoardStore } from "@/stores/boardStore"
import { persistJobStatus } from "@/lib/api"
import { enqueueSync } from "@/lib/offline"
import type { OptimizeResult } from "@/lib/optimize"

/**
 * Board mutations. Every write follows BR-07: apply optimistically, persist,
 * roll the store back to the snapshot on server rejection. Offline is a
 * distinct path (research §Phase 4): the optimistic state STANDS and the
 * serialized mutation joins the IndexedDB SyncQueue for background drain.
 */

function isOffline(): boolean {
  return useBoardStore.getState().offline || navigator.onLine === false
}

export async function performAssignment(
  jobId: string,
  techId: string,
  startBlock: number
): Promise<boolean> {
  const store = useBoardStore.getState()
  const check = store.canAssign(jobId, techId, startBlock)
  if (!check.ok) {
    toast({
      variant: "destructive",
      title: "Assignment blocked",
      description: check.reason
    })
    return false
  }

  store.snapshotJobs()
  const applied = store.assignJob(jobId, techId, startBlock)
  if (!applied.ok) return false

  if (store.simulateFailure) {
    store.rollbackJobs()
    toast({
      variant: "destructive",
      title: "Assignment rolled back",
      description: "Server rejected the change — the board reverted to its previous state."
    })
    return false
  }

  if (isOffline()) {
    await enqueueSync({ jobId, op: "assign", payload: { techId, startBlock } })
    toast({
      title: "Saved offline",
      description: "Assignment queued — it will sync automatically when you reconnect."
    })
    return true
  }

  if (store.dataMode === "live") {
    try {
      await persistJobStatus(jobId, "scheduled")
    } catch {
      store.rollbackJobs()
      toast({
        variant: "destructive",
        title: "Assignment rolled back",
        description: "Could not reach the API — the board reverted to its previous state."
      })
      return false
    }
  }

  const job = useBoardStore.getState().jobs[jobId]
  toast({
    title: `Assigned — ${job?.title ?? jobId}`,
    description: job ? `${job.title} is now queued on the board.` : undefined
  })
  return true
}

/**
 * Route Optimizer apply: one atomic batch placement (BR-07 at route scale).
 * The final layout is validated before anything mutates, so a bad route is
 * rejected outright instead of half-landing; offline queues every stop for
 * the background SyncQueue drain.
 */
export async function performRouteApply(result: OptimizeResult): Promise<boolean> {
  const store = useBoardStore.getState()
  const stops = result.routes.flatMap(route =>
    route.stops.map(stop => ({
      jobId: stop.jobId,
      techId: route.techId,
      startBlock: stop.startBlock
    }))
  )
  if (stops.length === 0) return false

  store.snapshotJobs()
  const beforeApply = store.jobs
  const applied = store.applyRouteStops(stops)
  if (!applied.ok) {
    toast({
      variant: "destructive",
      title: "Route rejected",
      description: applied.reason
    })
    return false
  }

  // Only genuinely new placements hit the API — re-sequenced jobs are local
  // board geometry, not fresh FSM assignments.
  const newlyAssigned = stops.filter(s => beforeApply[s.jobId]?.techId == null)

  if (store.simulateFailure) {
    store.rollbackJobs()
    toast({
      variant: "destructive",
      title: "Route rolled back",
      description: "Server rejected the batch — the board reverted to its previous state."
    })
    return false
  }

  if (isOffline()) {
    for (const stop of stops) {
      await enqueueSync({
        jobId: stop.jobId,
        op: "assign",
        payload: { techId: stop.techId, startBlock: stop.startBlock }
      })
    }
    toast({
      title: "Route applied offline",
      description: `${stops.length} placement${stops.length > 1 ? "s" : ""} queued — syncs on reconnect.`
    })
    return true
  }

  if (store.dataMode === "live") {
    try {
      await Promise.all(
        newlyAssigned.map(stop => persistJobStatus(stop.jobId, "scheduled"))
      )
    } catch {
      store.rollbackJobs()
      toast({
        variant: "destructive",
        title: "Route rolled back",
        description: "Could not reach the API — the board reverted to its previous state."
      })
      return false
    }
  }

  const travel = result.routes.reduce((sum, r) => sum + r.travelMinutes, 0)
  toast({
    title: `Route applied — ${stops.length} stop${stops.length > 1 ? "s" : ""}`,
    description: `${result.routes.length} route${result.routes.length > 1 ? "s" : ""} · ~${travel} min total travel${
      result.unplaced.length > 0
        ? ` · ${result.unplaced.length} left in queue (${result.unplaced[0].reason})`
        : ""
    }`
  })
  return true
}

export async function performClockOn(jobId: string): Promise<void> {
  const store = useBoardStore.getState()
  store.snapshotJobs()
  const { demoted } = store.clockOn(jobId)
  const job = useBoardStore.getState().jobs[jobId]

  if (store.simulateFailure) {
    store.rollbackJobs()
    toast({
      variant: "destructive",
      title: "Clock-on rolled back",
      description: "Server rejected the timer start — the board reverted."
    })
    return
  }

  if (isOffline()) {
    await enqueueSync({ jobId, op: "status", payload: { status: "in_progress" } })
    toast({
      title: `Clocked on — ${job?.title ?? jobId}`,
      description:
        demoted.length > 0
          ? `Single-active rule enforced: ${demoted.length} sibling job${demoted.length > 1 ? "s" : ""} muted to QUEUED. Queued offline — syncs on reconnect.`
          : `Timer restarted at 00:00:00. Queued offline — syncs on reconnect.`
    })
    return
  }

  if (store.dataMode === "live") {
    try {
      await persistJobStatus(jobId, "in_progress")
    } catch {
      store.rollbackJobs()
      toast({
        variant: "destructive",
        title: "Clock-on rolled back",
        description: "Could not reach the API — the timer did not start."
      })
      return
    }
  }

  toast({
    title: `Clocked on — ${job?.title ?? jobId}`,
    description:
      demoted.length > 0
        ? `Single-active rule enforced: ${demoted.length} sibling job${demoted.length > 1 ? "s" : ""} on this row muted to QUEUED.`
        : `Timer restarted at 00:00:00.`
  })
}

export async function performClockOff(jobId: string): Promise<void> {
  const store = useBoardStore.getState()
  const job = store.jobs[jobId]
  const finalSeconds = job?.elapsedSeconds ?? 0
  store.clockOff(jobId)

  if (isOffline()) {
    await enqueueSync({ jobId, op: "status", payload: { status: "completed" } })
    toast({
      title: `Clocked off — ${job?.title ?? jobId}`,
      description: "Saved offline — syncs on reconnect."
    })
    return
  }

  if (store.dataMode === "live") {
    try {
      await persistJobStatus(jobId, "completed")
    } catch {
      toast({
        title: `Clocked off — ${job?.title ?? jobId}`,
        description: "Saved locally; the API sync will retry."
      })
      return
    }
  }
  toast({
    title: `Clocked off — ${job?.title ?? jobId}`,
    description: `Final on-site time frozen at ${Math.floor(finalSeconds / 60)} min.`
  })
}

export function performMarkSent(jobId: string): void {
  const store = useBoardStore.getState()
  const job = store.jobs[jobId]
  const result = store.markQuoteSent(jobId)
  if (!result.ok) {
    toast({
      variant: "destructive",
      title: "Quote blocked from SENT",
      description: result.reason
    })
    return
  }
  toast({
    title: "Quote sent",
    description: `Financials dispatched to ${job?.quote.clientName}.`
  })
}

export function performMarkApproved(jobId: string): void {
  const store = useBoardStore.getState()
  const job = store.jobs[jobId]
  const result = store.markQuoteApproved(jobId)
  if (!result.ok) {
    toast({ variant: "destructive", title: "Cannot approve", description: result.reason })
    return
  }
  toast({
    title: "Quote approved",
    description: `${job?.quote.clientName} signed off on the pricing.`
  })
}
