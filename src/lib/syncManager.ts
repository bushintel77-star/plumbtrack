import {
  calculateBackoff,
  isTerminalSyncError,
  loadOutbox,
  removeOperation,
  subscribeOutbox,
  updateOperation
} from "./outbox"

/**
 * Sync manager — the RN port of apps/web's flush loop: process ops in
 * creation order, skip ops whose dependencies are still queued, cascade
 * user-action failures to dependents, retryable failures back off
 * exponentially (2 s → 5 min), terminal failures park for the Sync tab.
 */

export type OutboxHandler = (op: import("./types").OutboxOperation) => Promise<void>

export interface SyncState {
  flushing: boolean
  lastSyncedAt: string | null
  lastError: string | null
}

let handler: OutboxHandler | null = null
let timer: ReturnType<typeof setInterval> | null = null
let state: SyncState = { flushing: false, lastSyncedAt: null, lastError: null }
const stateListeners = new Set<(state: SyncState) => void>()

export function subscribeSync(listener: (state: SyncState) => void): () => void {
  stateListeners.add(listener)
  listener(state)
  return () => stateListeners.delete(listener)
}

function setState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch }
  for (const listener of stateListeners) listener(state)
}

export function createSyncManager(flushHandler: OutboxHandler, intervalMs = 5000) {
  handler = flushHandler

  async function flush(): Promise<void> {
    if (!handler || state.flushing) return
    const ops = (await loadOutbox()).filter(op => op.status === "pending" && op.nextRetryTimestamp <= Date.now())
    if (ops.length === 0) return

    setState({ flushing: true, lastError: null })
    try {
      const queue = await loadOutbox()
      const remainingIds = new Set(queue.map(op => op.id))

      for (const op of ops) {
        // Ordering: an op whose dependency is still queued waits its turn.
        if (op.dependsOn.some(dep => remainingIds.has(dep))) continue

        try {
          await handler(op)
          await removeOperation(op.id)
          remainingIds.delete(op.id)
          setState({ lastSyncedAt: new Date().toISOString() })
        } catch (error) {
          if (isTerminalSyncError(error)) {
            await updateOperation(op.id, {
              status: "failed_requires_user_action",
              lastError: error instanceof Error ? error.message : String(error)
            })
            // A failed op blocks everything behind it — surface the same
            // verdict to dependents instead of silently skipping them.
            for (const dependent of queue.filter(d => d.dependsOn.includes(op.id))) {
              await updateOperation(dependent.id, {
                status: "failed_requires_user_action",
                lastError: `Blocked by failed ${op.kind}`
              })
            }
          } else {
            await updateOperation(op.id, {
              retryCount: op.retryCount + 1,
              nextRetryTimestamp: Date.now() + calculateBackoff(op.retryCount),
              lastError: error instanceof Error ? error.message : String(error)
            })
          }
        }
      }
    } finally {
      setState({ flushing: false })
    }
  }

  timer = setInterval(() => void flush(), intervalMs)
  const unsubscribeOps = subscribeOutbox(() => void flush())

  return {
    flush,
    stop() {
      if (timer) clearInterval(timer)
      unsubscribeOps()
    }
  }
}
