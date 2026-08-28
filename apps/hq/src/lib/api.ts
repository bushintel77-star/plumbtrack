/**
 * HQ API client — mirrors the conventions of apps/web's `lib/api.ts`:
 * timeout + request tracing, NetworkError (retryable) vs HttpError (terminal).
 * The board never blocks on the API: a failure flips the board to demo data.
 */

export const API_URL =
  process.env.NEXT_PUBLIC_HQ_API_URL ?? "http://localhost:8080"

/** Dev/test-only tenancy header, matching the API's local fallback contract. */
const ORG_HEADER = "x-organization-id"
const REQUEST_ID_HEADER = "x-request-id"
const DEV_ORG_ID = process.env.NEXT_PUBLIC_HQ_DEV_ORG_ID ?? "seed-org"

const API_TIMEOUT_MS = 4000

/** `HQ_FORCE_DEMO=1` keeps the board deterministic (Playwright, offline demos). */
export const FORCE_DEMO = process.env.NEXT_PUBLIC_HQ_FORCE_DEMO === "1"

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
    throw new NetworkError(
      `API ${path} unreachable: ${error instanceof Error ? error.message : String(error)}`
    )
  } finally {
    clearTimeout(timeout)
  }
}

/** Server persistence for board mutations. Assignment sync is gap G-2 in the
 *  application map — until the endpoint exists we persist status transitions
 *  only, and assignment stays client-authoritative with a visible notice. */
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
