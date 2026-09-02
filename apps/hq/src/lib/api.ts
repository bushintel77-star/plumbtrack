/**
 * HQ API client — mirrors the conventions of apps/web's `lib/api.ts`:
 * timeout + request tracing, NetworkError (retryable) vs HttpError (terminal).
 * The board never blocks on the API: a failure flips the board to demo data.
 */

function buildApiUrl(raw?: string): string {
  if (!raw) return "http://localhost:8080"
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw
  return `https://${raw}`
}

export const API_URL = buildApiUrl(process.env.NEXT_PUBLIC_HQ_API_URL)

/** Dev/test-only tenancy header, matching the API's local fallback contract. */
const ORG_HEADER = "x-organization-id"
const REQUEST_ID_HEADER = "x-request-id"
const DEV_ORG_ID = process.env.NEXT_PUBLIC_HQ_DEV_ORG_ID ?? "seed-org"

const API_TIMEOUT_MS = 4000

/** `HQ_FORCE_DEMO=1` keeps the board deterministic (Playwright, offline demos). */
export const FORCE_DEMO = process.env.NEXT_PUBLIC_HQ_FORCE_DEMO === "1"

export interface HqSession {
  authenticated: boolean
  userId: string
  organizationId: string
  role: string
  expiresAt: number
}

export class NetworkError extends Error {
  readonly retryable = true
  constructor(message: string) {
    super(message)
    this.name = "NetworkError"
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = "HttpError"
  }
}

function newRequestId(): string {
  return crypto.randomUUID().slice(0, 8)
}

export async function apiGet<T>(path: string): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    const response = await fetch(`${API_URL}${path}`, {
      credentials: "include",
      signal: controller.signal,
      headers: {
        [ORG_HEADER]: DEV_ORG_ID,
        [REQUEST_ID_HEADER]: newRequestId()
      }
    })
    if (!response.ok) {
      const body = await response.text()
      if (response.status === 429 || response.status >= 500) {
        throw new NetworkError(`API ${path} failed (${response.status}): ${body}`)
      }
      throw new HttpError(response.status, `API ${path} failed (${response.status}): ${body}`)
    }
    return (await response.json()) as T
  } catch (error) {
    if (error instanceof HttpError) throw error
    if (error instanceof NetworkError) throw error
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new NetworkError(`API ${path} timed out after ${API_TIMEOUT_MS}ms`)
    }
    throw new NetworkError(
      `API ${path} unreachable: ${error instanceof Error ? error.message : String(error)}`
    )
  } finally {
    clearTimeout(timeout)
  }
}

/** Server persistence for board mutations. Assignments persist through
 *  `authApi.assignment` (PATCH /api/jobs/:id/assignment, gap G-2): the endpoint
 *  requires a schedulable appointment and enforces org membership plus the
 *  job's `requiredSkill` against the technician. */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: init.credentials ?? "include",
      signal: init.signal ?? controller.signal,
      headers: {
        "Content-Type": "application/json",
        [ORG_HEADER]: DEV_ORG_ID,
        [REQUEST_ID_HEADER]: newRequestId(),
        ...(init.headers ?? {})
      }
    })
    if (!response.ok) {
      const body = await response.text()
      if (response.status === 429 || response.status >= 500) {
        throw new NetworkError(`API ${path} failed (${response.status}): ${body}`)
      }
      throw new HttpError(response.status, `API ${path} failed (${response.status}): ${body}`)
    }
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
  } catch (error) {
    if (error instanceof HttpError || error instanceof NetworkError) throw error
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new NetworkError(`API ${path} timed out after ${API_TIMEOUT_MS}ms`)
    }
    throw new NetworkError(`API ${path} unreachable: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    clearTimeout(timeout)
  }
}

export const authApi = {
  session: () => apiGet<HqSession>("/api/auth/session"),
  streamToken: () => apiGet<{ token: string; organizationId: string; role: string }>("/api/auth/stream-token"),
  assignment: (jobId: string, technicianId: string, startBlock: number) =>
    apiRequest(`/api/jobs/${jobId}/assignment`, {
      method: "PATCH",
      body: JSON.stringify({ technicianId, startBlock })
    }),
  renew: () => apiRequest<HqSession>("/api/auth/renew", { method: "POST" }),
  signOut: () => apiRequest<void>("/api/auth/sign-out", { method: "POST" }),
  /**
   * Customer ETA notification — sends the "on our way, ETA ~N min" SMS to the
   * job's customer. ETA is computed on the client and the server templates +
   * sends via the SMS adapter (Twilio).
   */
  sendEta: (jobId: string, etaMinutes: number, message?: string) =>
    apiRequest<{ sent: boolean; mode: "test" | "live" }>("/api/sms/eta", {
      method: "POST",
      body: JSON.stringify({ jobId, etaMinutes, ...(message ? { message } : {}) })
    }),
  listMessages: (jobId: string) =>
    apiGet<{ messages: Array<{ id: string; direction: "dispatch" | "field"; sender: string; body: string; createdAt: string }> }>(`/api/jobs/${jobId}/messages`),
  postMessage: (jobId: string, body: string, sender: string) =>
    apiRequest<{ message: { id: string; direction: "dispatch" | "field"; sender: string; body: string; createdAt: string } }>(`/api/jobs/${jobId}/messages`, {
      method: "POST",
      body: JSON.stringify({ direction: "dispatch", sender, body })
    }),
  /**
   * HQ operator sign-in: presents the deployment's `HQ_BOOTSTRAP_TOKEN` to
   * mint a station-role session (dispatcher/manager/accountant/admin/owner).
   * The secret is typed by the operator at runtime — never baked into the
   * web bundle.
   */
  hqLogin: (bootstrapToken: string) =>
    apiRequest<HqSession>("/api/auth/hq-session", {
      method: "POST",
      headers: { Authorization: `Bearer ${bootstrapToken}` }
    })
}

export async function persistJobStatus(
  jobId: string,
  status: "scheduled" | "in_progress" | "completed"
): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    const response = await fetch(`${API_URL}/api/jobs/${jobId}`, {
      method: "PATCH",
      signal: controller.signal,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        [ORG_HEADER]: DEV_ORG_ID,
        [REQUEST_ID_HEADER]: newRequestId()
      },
      body: JSON.stringify({ status })
    })
    if (!response.ok) {
      throw new NetworkError(`Persist failed (${response.status}) for ${jobId}`)
    }
  } finally {
    clearTimeout(timeout)
  }
}
