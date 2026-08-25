import { API_URL, DEFAULT_ORG_ID } from "./constants";
import { AUTH_TOKEN_STORAGE_KEY } from "./api";
import { HttpError } from "./errors";

export type IntegrationDeliveryStatus = "pending" | "processing" | "delivered" | "failed" | "dead_letter";

export interface IntegrationDeliveryAttempt {
  id: string;
  attemptNumber: number;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  httpStatus: number | null;
  providerMessageId: string | null;
  error: string | null;
}

export interface IntegrationDelivery {
  id: string;
  provider: string;
  status: IntegrationDeliveryStatus;
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  providerMessageId: string | null;
  createdAt: string;
  deliveredAt: string | null;
  attemptsHistory: IntegrationDeliveryAttempt[];
}

export interface IntegrationHealth {
  pending: number;
  processing: number;
  failed: number;
  deadLetter: number;
  delivered: number;
  needsAttention: boolean;
}

function headers(): Record<string, string> {
  const token = typeof window === "undefined" ? null : window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  return {
    ["x-organization-id"]: DEFAULT_ORG_ID,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new HttpError(response.status, `Integration request failed (${response.status})`);
  return (await response.json()) as T;
}

export const integrationsApi = {
  health: () => request<IntegrationHealth>("/api/integrations/health"),
  deliveries: () => request<IntegrationDelivery[]>("/api/integrations/deliveries"),
  retry: (id: string) => request<{ queued: boolean; id: string }>(`/api/integrations/deliveries/${id}/retry`, { method: "POST" }),
};
