import { config } from "./config"
import { clearSession, enrollDeviceSession, getSession } from "./auth"
import type { Job } from "./types"

/**
 * API client — the RN mirror of apps/web/src/lib/api.ts: bearer session,
 * org header, per-request id, timeout abort; 401 clears the session so the
 * next boot re-enrols. Errors are typed so the outbox can distinguish
 * retryable (network/429/5xx) from terminal (other 4xx).
 */

export class NetworkError extends Error {
  retryable = true as const
}
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500
  }
}

let requestCounter = 0

/** Correlation id per request — uniqueness via monotonic counter + clock;
 *  not a secret, so no crypto primitive required. */
function requestId(): string {
  requestCounter = (requestCounter + 1) % 0xffff
  return `${Date.now().toString(36)}-${requestCounter.toString(36)}`
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let session = await getSession()
  if (!session) session = await enrollDeviceSession()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.apiTimeoutMs)
  try {
    const res = await fetch(`${config.apiUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "x-organization-id": config.orgId,
        "x-request-id": requestId(),
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
        ...(init.headers ?? {})
      },
      signal: controller.signal
    })
    if (res.status === 401) {
      await clearSession()
      throw new HttpError(401, "Session expired")
    }
    if (!res.ok) {
      throw new HttpError(res.status, `API ${res.status} on ${path}`)
    }
    return (await res.json()) as T
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new NetworkError(error instanceof Error ? error.message : "network")
  } finally {
    clearTimeout(timer)
  }
}

// ── Endpoints the field day uses ────────────────────────────────────────────

export async function listJobs(): Promise<Job[]> {
  const jobs = await request<Partial<Job>[]>("/api/jobs")
  return jobs.map(normalizeJob)
}

/** Per-job clock in — opId is the idempotency key shared with the outbox. */
export async function clockIn(
  jobId: string,
  opId: string,
  start: string,
  coords: { lat: number | null; lng: number | null }
): Promise<void> {
  await request(`/api/jobs/${jobId}/time-entries`, {
    method: "POST",
    body: JSON.stringify({ opId, start, lat: coords.lat, lng: coords.lng })
  })
}

export async function clockOut(jobId: string, entryId: string, end: string): Promise<void> {
  await request(`/api/jobs/${jobId}/time-entries/${entryId}`, {
    method: "PATCH",
    body: JSON.stringify({ end })
  })
}

/** Step 1 of the 3-step signed media upload (see outbox handler for 2–3). */
export async function createUploadIntent(jobId: string, opId: string, contentType: string) {
  return request<{ assetId: string; uploadUrl: string }>("/api/media/upload-intents", {
    method: "POST",
    body: JSON.stringify({ jobId, opId, contentType })
  })
}

export async function completeJob(jobId: string, opId: string): Promise<void> {
  await request(`/api/jobs/${jobId}`, {
    method: "PATCH",
    body: JSON.stringify({ opId, status: "completed" })
  })
}

/** Checklist item completion — the server is idempotent on the item state,
 *  so an outbox retry with the same completedAt is a safe no-op. */
export async function toggleChecklistItemOnServer(
  jobId: string,
  itemId: string,
  completed: boolean,
  completedAt: string,
  _opId: string
): Promise<void> {
  await request(`/api/jobs/${jobId}/checklist-items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ completed, completedAt })
  })
}

// ── Normalisation ───────────────────────────────────────────────────────────

function normalizeJob(raw: Partial<Job>): Job {
  return {
    id: raw.id ?? "",
    client: raw.client ?? "Unknown client",
    address: raw.address ?? "",
    scope: raw.scope ?? "",
    phone: raw.phone,
    accessCode: raw.accessCode,
    jobType: raw.jobType,
    status: raw.status ?? "scheduled",
    timeEntries: raw.timeEntries ?? [],
    photos: raw.photos ?? [],
    serviceItems: raw.serviceItems ?? []
  }
}
