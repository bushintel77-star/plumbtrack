import AsyncStorage from "@react-native-async-storage/async-storage"

import { HttpError, NetworkError } from "./api"
import type { OutboxOperation } from "./types"

/**
 * Offline outbox — the AsyncStorage port of apps/web's IndexedDB outbox,
 * same op model: id doubles as the server idempotency key (opId), ops run
 * in creation order, `dependsOn` gates ordering, terminal 4xx parks the op
 * for user action instead of silently dropping it. Silent failure in the
 * field means a completed job that never reaches the office.
 */

const STORE_KEY = "plumbtrack-outbox"
const BASE_RETRY_MS = 2_000
const MAX_RETRY_MS = 5 * 60_000

let cache: OutboxOperation[] | null = null
const listeners = new Set<() => void>()

export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit(): void {
  for (const listener of listeners) listener()
}

export async function loadOutbox(): Promise<OutboxOperation[]> {
  if (cache) return cache
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY)
    cache = raw ? (JSON.parse(raw) as OutboxOperation[]) : []
  } catch {
    cache = []
  }
  return cache!
}

async function persist(next: OutboxOperation[]): Promise<void> {
  cache = next
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(next))
  emit()
}

let opCounter = 0

/** Op id = server idempotency key: uniqueness via counter + clock is
 *  sufficient; it is not a secret and is sent to the server in cleartext. */
function nextOpId(kind: OutboxOperation["kind"]): string {
  opCounter = (opCounter + 1) % 0xffffff
  return `${kind}-${Date.now().toString(36)}-${opCounter.toString(36)}`
}

export async function enqueue(kind: OutboxOperation["kind"], payload: Record<string, unknown>, id?: string): Promise<OutboxOperation> {
  const op: OutboxOperation = {
    id: id ?? nextOpId(kind),
    kind,
    payload,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    nextRetryTimestamp: Date.now(),
    status: "pending",
    dependsOn: []
  }
  await persist([...(await loadOutbox()), op])
  return op
}

export async function getOperation(id: string): Promise<OutboxOperation | undefined> {
  return (await loadOutbox()).find(op => op.id === id)
}

export async function removeOperation(id: string): Promise<void> {
  await persist((await loadOutbox()).filter(op => op.id !== id))
}

export async function updateOperation(id: string, patch: Partial<OutboxOperation>): Promise<void> {
  await persist((await loadOutbox()).map(op => (op.id === id ? { ...op, ...patch } : op)))
}

/** Terminal errors park the op for the Sync tab's retry/discard controls. */
export function isTerminalSyncError(error: unknown): boolean {
  if (error instanceof HttpError) return !error.retryable
  if (error instanceof NetworkError) return false
  return false
}

export function calculateBackoff(retryCount: number): number {
  const exponential = BASE_RETRY_MS * 2 ** retryCount
  const jitter = Math.random() * 0.3 * exponential
  return Math.min(MAX_RETRY_MS, Math.round(exponential + jitter))
}

export async function retryFailedOperations(): Promise<void> {
  await persist(
    (await loadOutbox()).map(op =>
      op.status === "failed_requires_user_action"
        ? { ...op, status: "pending", retryCount: 0, nextRetryTimestamp: Date.now(), lastError: null }
        : op
    )
  )
}

export async function discardFailedOperations(): Promise<void> {
  await persist((await loadOutbox()).filter(op => op.status !== "failed_requires_user_action"))
}
