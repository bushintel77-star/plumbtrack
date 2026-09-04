"use client"

import { openDB, type IDBPDatabase } from "idb"
import type { Job } from "@/types"

/**
 * Offline-first groundwork (research §Phase 4): IndexedDB cache for
 * AssignedJobs + CustomerDetails and a durable SyncQueue. Mutations made
 * while offline are written to the queue and re-driven sequentially when
 * connectivity returns — Last-Write-Wins per (jobId + op) resolution.
 */

export interface SyncOp {
  id?: number
  jobId: string
  op: "assign" | "status"
  queuedAt: number
  payload: Record<string, unknown>
}

interface HqDbSchema {
  "jobs-cache": { key: string; value: Job }
  "customers-cache": { key: string; value: { id: string; name: string } }
  "sync-queue": { key: number; value: SyncOp; indexes: { "by-job": string } }
}

let dbPromise: Promise<IDBPDatabase<HqDbSchema>> | null = null

function db(): Promise<IDBPDatabase<HqDbSchema>> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable outside the browser"))
  }
  if (!dbPromise) {
    dbPromise = openDB<HqDbSchema>("plumbtrack-hq", 1, {
      upgrade(database) {
        database.createObjectStore("jobs-cache")
        database.createObjectStore("customers-cache")
        const queue = database.createObjectStore("sync-queue", {
          keyPath: "id",
          autoIncrement: true
        })
        queue.createIndex("by-job", "jobId")
      }
    })
  }
  return dbPromise
}

export async function cacheJobs(jobs: Job[]): Promise<void> {
  try {
    const database = await db()
    const tx = database.transaction("jobs-cache", "readwrite")
    for (const job of jobs) void tx.store.put(job)
    await tx.done
  } catch {
    // Storage unavailable — offline cache is best-effort.
  }
}

export async function readCachedJobs(): Promise<Job[]> {
  try {
    const database = await db()
    return database.getAll("jobs-cache")
  } catch {
    return []
  }
}

export async function enqueueSync(
  op: Omit<SyncOp, "id" | "queuedAt">
): Promise<void> {
  try {
    const database = await db()
    // Last-Write-Wins: a newer op for the same job+op replaces the older one.
    const existing = await database.getAllFromIndex("sync-queue", "by-job", op.jobId)
    for (const stale of existing.filter(e => e.op === op.op)) {
      if (stale.id !== undefined) void database.delete("sync-queue", stale.id)
    }
    await database.add("sync-queue", { ...op, queuedAt: Date.now() })
  } catch {
    // Queue write failed — the in-memory optimistic state still stands.
  }
}

export async function pendingSyncCount(): Promise<number> {
  try {
    const database = await db()
    return database.count("sync-queue")
  } catch {
    return 0
  }
}

/**
 * Drain the queue sequentially against the op-appropriate persist endpoint.
 * Each op is deleted only after a successful request; failures leave the op
 * for the next drain (exponential patience, matching the webhook retry
 * philosophy).
 */
export async function drainSyncQueue(
  persist: (op: SyncOp) => Promise<void>
): Promise<number> {
  let drained = 0
  try {
    const database = await db()
    const ops = await database.getAll("sync-queue")
    ops.sort((a, b) => a.queuedAt - b.queuedAt)
    for (const op of ops) {
      try {
        await persist(op)
        if (op.id !== undefined) await database.delete("sync-queue", op.id)
        drained++
      } catch {
        break // Still offline / server unhappy — retry on next drain.
      }
    }
  } catch {
    // Database unavailable — nothing to drain.
  }
  return drained
}

/** Wire browser-online + service-worker sync notifications to the drain. */
export function registerSyncDrain(
  persist: (op: SyncOp) => Promise<void>,
  onDrained?: (count: number) => void
): () => void {
  const drain = (): void => {
    void drainSyncQueue(persist).then(count => {
      if (count > 0) onDrained?.(count)
    })
  }
  window.addEventListener("online", drain)
  navigator.serviceWorker?.addEventListener("message", (event: MessageEvent) => {
    if ((event as MessageEvent<{ type?: string }>).data?.type === "drain-sync") drain()
  })
  drain()
  return () => window.removeEventListener("online", drain)
}
