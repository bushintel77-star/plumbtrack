import * as Location from "expo-location"

import { clockIn, clockOut, completeJob, createUploadIntent, toggleChecklistItemOnServer } from "./api"
import { enqueue } from "./outbox"
import { config } from "./config"
import { hapticShiftCommitted } from "./haptics"
import { getFieldState, patchJob } from "@/state/store"
import type { OutboxOperation } from "./types"

/**
 * Field mutations — every write goes through the outbox first (offline-first
 * law), then applies an optimistic local patch. The sync handler maps each
 * queued kind onto its API call; the op id is the server idempotency key.
 * Payloads carry everything the flush needs — no store lookups at sync time.
 */

/** One-shot evidence fix at a compliance event (clock-in, photo, sign-off).
 *  Point-in-time capture only — the app never streams location. Hard
 *  3-second bound: a hanging permission prompt (or slow GNSS) must never
 *  stall a log-on — the worker clocks on and the fix records as null. */
export async function captureEvidenceFix(): Promise<{ lat: number | null; lng: number | null }> {
  const nulls = { lat: null, lng: null }
  try {
    const acquired = await Promise.race([
      (async () => {
        const permission = await Location.requestForegroundPermissionsAsync()
        if (!permission.granted) return nulls
        const fix = await Location.getLastKnownPositionAsync()
        if (!fix) return nulls
        return {
          lat: Math.round(fix.coords.latitude * 1e6) / 1e6,
          lng: Math.round(fix.coords.longitude * 1e6) / 1e6
        }
      })(),
      new Promise<typeof nulls>(resolve => setTimeout(() => resolve(nulls), 3000))
    ])
    return acquired
  } catch {
    return nulls
  }
}

export async function startJobClock(jobId: string): Promise<void> {
  const start = new Date().toISOString()
  const coords = await captureEvidenceFix()
  const entryId = `te-${jobId}-${Date.now().toString(36)}`
  // previousStatus rides the payload so DISCARD can roll the optimistic
  // patch back if the server terminally rejects the write.
  const previousStatus = getFieldState().jobs.find(job => job.id === jobId)?.status ?? "scheduled"
  await enqueue(
    "clock-in",
    { jobId, entryId, start, lat: coords.lat, lng: coords.lng, previousStatus },
    entryId
  )
  patchJob(jobId, {
    status: "in_progress",
    timeEntries: [{ id: entryId, staffId: "staff-1", start, end: null, lat: coords.lat, lng: coords.lng }]
  })
  hapticShiftCommitted.clockStart()
}

export async function stopJobClock(jobId: string): Promise<void> {
  const openEntry = getFieldState().jobs
    .find(job => job.id === jobId)
    ?.timeEntries.find(entry => entry.end === null)
  const end = new Date().toISOString()
  await enqueue("clock-out", { jobId, entryId: openEntry?.id ?? null, end })
  patchJob(jobId, { status: "scheduled", timeEntries: [] })
  hapticShiftCommitted.clockStop()
}

export async function completeJobWithEvidence(jobId: string): Promise<void> {
  const previousStatus = getFieldState().jobs.find(job => job.id === jobId)?.status ?? "scheduled"
  await enqueue(
    "complete-job",
    { jobId, previousStatus },
    `complete-${jobId}-${Date.now().toString(36)}`
  )
  patchJob(jobId, { status: "completed" })
  hapticShiftCommitted.jobComplete()
}

/** Roll back the optimistic patch of a failed op (DISCARD in the sync
 *  sheet): the board returns to the state the server actually has. */
export function revertFailedOperation(op: OutboxOperation): void {
  const { jobId, previousStatus } = op.payload as { jobId?: string; previousStatus?: import("@/types").JobStatus }
  if (!jobId || !previousStatus) return
  patchJob(jobId, { status: previousStatus, timeEntries: [] })
}

/** Toggle a checklist item — optimistic patch + outbox write. Completion
 *  timestamps ride the payload so retries are idempotent server-side. */
export async function toggleChecklistItem(jobId: string, itemId: string, completed: boolean): Promise<void> {
  const completedAt = completed ? new Date().toISOString() : null
  const job = getFieldState().jobs.find(item => item.id === jobId)
  if (job?.checklists) {
    patchJob(jobId, {
      checklists: job.checklists.map(item =>
        item.id === itemId ? { ...item, completedAt, completedBy: completedAt ? "field" : null } : item
      )
    })
  }
  await enqueue(
    "checklist-item",
    { jobId, itemId, completed, completedAt: completedAt ?? new Date().toISOString() },
    `chk-${itemId}-${completed ? "on" : "off"}-${Date.now().toString(36)}`
  )
  hapticShiftCommitted.breakStart()
}

// ── Sync handler: queued op → API call ──────────────────────────────────────

export async function handleOutboxOperation(op: OutboxOperation): Promise<void> {
  if (config.forceDemo) {
    // Demo mode: succeed immediately so the queue stays demonstrable
    // without a backend.
    return
  }
  switch (op.kind) {
    case "clock-in": {
      const { jobId, start, lat, lng } = op.payload as {
        jobId: string; start: string; lat: number | null; lng: number | null
      }
      await clockIn(jobId, op.id, start, { lat, lng })
      return
    }
    case "clock-out": {
      const { jobId, entryId, end } = op.payload as {
        jobId: string; entryId: string | null; end: string
      }
      if (entryId) await clockOut(jobId, entryId, end)
      return
    }
    case "complete-job": {
      const { jobId } = op.payload as { jobId: string }
      await completeJob(jobId, op.id)
      return
    }
    case "checklist-item": {
      const { jobId, itemId, completed, completedAt } = op.payload as {
        jobId: string; itemId: string; completed: boolean; completedAt: string
      }
      await toggleChecklistItemOnServer(jobId, itemId, completed, completedAt, op.id)
      return
    }
    case "photo-upload": {
      const { jobId, base64, contentType } = op.payload as {
        jobId: string; base64: string; contentType: string
      }
      const intent = await createUploadIntent(jobId, op.id, contentType)
      const put = await fetch(intent.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: base64
      })
      if (!put.ok) throw new Error(`upload ${put.status}`)
      await fetch(`${config.apiUrl}/api/media/${intent.assetId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      })
      return
    }
  }
}
