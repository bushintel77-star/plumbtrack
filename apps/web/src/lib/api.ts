import { API_TIMEOUT_MS, API_URL, DEFAULT_ORG_ID } from "./constants";
import { clearAuthSession, getAuthSession } from "./auth";
import type { Job, JobPhoto, JobStatus, Quote, QuoteStatus, TimeEntry } from "@/types";
import { HttpError } from "./errors";

const ORG_HEADER = "x-organization-id";
const REQUEST_ID_HEADER = "x-request-id";
export const AUTH_TOKEN_STORAGE_KEY = "plumbtrack-auth-token";

/** Transient failure (network drop, timeout, 5xx, 429). Safe to retry. */
export class NetworkError extends Error {
  readonly retryable = true;

  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

function newRequestId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function getStoredAuthHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  // Prefer the enrolled device session; fall back to a manually-placed token
  // so existing deployments keep working.
  const sessionToken = getAuthSession()?.token?.trim();
  if (sessionToken) return { Authorization: `Bearer ${sessionToken}` };
  const legacy = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)?.trim();
  return legacy ? { Authorization: `Bearer ${legacy}` } : {};
}

/**
 * Request with timeout + tracing. Network/throttling/server errors throw
 * `NetworkError` (retryable); 4xx client errors throw `HttpError` (mostly
 * terminal). The sync outbox uses this split to decide retry vs discard.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
      headers: {
        "Content-Type": "application/json",
        [ORG_HEADER]: DEFAULT_ORG_ID,
        [REQUEST_ID_HEADER]: newRequestId(),
        ...getStoredAuthHeader(),
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new NetworkError(`API request to ${path} timed out after ${API_TIMEOUT_MS}ms`);
    }
    throw new NetworkError(`API request to ${path} failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 429 || response.status >= 500) {
      throw new NetworkError(`API request failed (${response.status}): ${body}`);
    }
    // An expired/revoked session must not silently poison every later call —
    // drop it so the next boot re-enrolls a fresh one.
    if (response.status === 401) clearAuthSession();
    throw new HttpError(response.status, `API request failed (${response.status}): ${body}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/**
 * True when an error from the API client is safe to retry — network drops,
 * timeouts, rate limits and server errors. 4xx (except 429) are terminal.
 */
export function isRetryableApiError(error: unknown): boolean {
  return error instanceof NetworkError;
}

export interface CreateJobInput {
  client: string;
  address: string;
  scope: string;
  phone?: string;
  accessCode?: string;
  trade?: string;
  customerId?: string;
  propertyId?: string;
  status?: JobStatus;
}

export interface UpdateJobInput {
  client?: string;
  address?: string;
  scope?: string;
  phone?: string | null;
  accessCode?: string | null;
  trade?: string;
  customerId?: string | null;
  propertyId?: string | null;
  status?: JobStatus;
  signature?: string | null;
}

export interface CreateTimeEntryInput {
  staffId: string;
  /** Idempotency key — the offline queue's op id, so replays never duplicate. */
  opId: string;
  start: string;
  lat?: number | null;
  lng?: number | null;
}

export interface UpdateTimeEntryInput {
  end: string;
}

export interface CreatePhotoInput {
  label: string;
  url: string;
  /** Client outbox key so an ambiguous retry cannot duplicate evidence. */
  opId: string;
}

export interface PhotoUploadIntent {
  assetId: string;
  objectKey: string;
  uploadUrl: string;
  expiresAt: string;
  headers: { "Content-Type": string };
}

export interface CreatePhotoUploadIntentInput {
  jobId: string;
  opId: string;
  label: string;
  contentType: string;
  byteSize: number;
  sha256?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

export interface Property {
  id: string;
  customerId: string;
  address: string;
  accessCode?: string | null;
  notes?: string | null;
}

export interface Appointment {
  id: string;
  jobId: string;
  assignedStaffId?: string | null;
  scheduledStart: string;
  scheduledEnd?: string | null;
  status: string;
}

export interface CreateQuoteInput {
  client: string;
  address: string;
  description: string;
  trade?: string;
  lines: Array<{ desc: string; qty: number; unit: string; rate: number }>;
}

export interface UpdateQuoteInput {
  client?: string;
  address?: string;
  description?: string;
  trade?: string;
  status?: QuoteStatus;
  signature?: string | null;
}

export const api = {
  listJobs: () => request<Job[]>("/api/jobs"),

  listQuotes: () => request<Quote[]>("/api/quotes"),

  createQuote: (input: CreateQuoteInput) =>
    request<Quote>("/api/quotes", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  listCustomers: () => request<Customer[]>("/api/customers"),
  createCustomer: (input: Omit<Customer, "id">) => request<Customer>("/api/customers", { method: "POST", body: JSON.stringify(input) }),
  listCustomerProperties: (customerId: string) => request<Property[]>(`/api/customers/${customerId}/properties`),
  createProperty: (customerId: string, input: Omit<Property, "id" | "customerId">) => request<Property>(`/api/customers/${customerId}/properties`, { method: "POST", body: JSON.stringify(input) }),
  listAppointments: () => request<Appointment[]>("/api/appointments"),

  createJob: (input: CreateJobInput) =>
    request<Job>("/api/jobs", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  updateJob: (id: string, input: UpdateJobInput) =>
    request<Job>(`/api/jobs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  updateQuote: (id: string, input: UpdateQuoteInput) =>
    request<Quote>(`/api/quotes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  createTimeEntry: (jobId: string, input: CreateTimeEntryInput) =>
    request<TimeEntry>(`/api/jobs/${jobId}/time-entries`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  updateTimeEntry: (jobId: string, entryId: string, input: UpdateTimeEntryInput) =>
    request<TimeEntry>(`/api/jobs/${jobId}/time-entries/${entryId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  createPhoto: (jobId: string, input: CreatePhotoInput) =>
    request<JobPhoto>(`/api/jobs/${jobId}/photos`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  createPhotoUploadIntent: (input: CreatePhotoUploadIntentInput) =>
    request<PhotoUploadIntent>("/api/media/upload-intents", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  uploadPhotoBinary: async (intent: PhotoUploadIntent, body: Blob | ArrayBuffer): Promise<void> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(intent.uploadUrl, {
        method: "PUT",
        headers: intent.headers,
        body,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new NetworkError("Media upload timed out");
      }
      throw new NetworkError(`Media upload failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      if (response.status >= 500 || response.status === 429) {
        throw new NetworkError(`Media upload failed (${response.status})`);
      }
      throw new HttpError(response.status, `Media upload failed (${response.status})`);
    }
  },

  completePhotoUpload: (assetId: string) =>
    request<{ assetId: string; photoId: string; photoUrl: string }>(`/api/media/${assetId}/complete`, {
      method: "POST",
      body: JSON.stringify({ assetId }),
    }),

  createPaymentLink: (jobId: string, amount: number) =>
    request<{ url: string; mode: "live" | "test"; configured: boolean; amount: number; currency: string }>(
      `/api/jobs/${jobId}/payment-link`,
      { method: "POST", body: JSON.stringify({ amount }) },
    ),
};
