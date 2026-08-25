import { API_URL, DEFAULT_ORG_ID } from "./constants";
import type { Job, JobPhoto, JobStatus, Quote, QuoteStatus, TimeEntry } from "@/types";
import { HttpError } from "./errors";

const ORG_HEADER = "x-organization-id";
export const AUTH_TOKEN_STORAGE_KEY = "plumbtrack-auth-token";

function getStoredAuthHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)?.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Store an identity-provider token without coupling the API client to one provider. */
export function setAuthToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token?.trim()) window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token.trim());
  else window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      [ORG_HEADER]: DEFAULT_ORG_ID,
      ...getStoredAuthHeader(),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new HttpError(response.status, `API request failed (${response.status}): ${body}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
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
    const response = await fetch(intent.uploadUrl, {
      method: "PUT",
      headers: intent.headers,
      body,
    });
    if (!response.ok) throw new HttpError(response.status, `Media upload failed (${response.status})`);
  },

  completePhotoUpload: (assetId: string) =>
    request<{ assetId: string; photoId: string; photoUrl: string }>(`/api/media/${assetId}/complete`, {
      method: "POST",
      body: JSON.stringify({ assetId }),
    }),
};
