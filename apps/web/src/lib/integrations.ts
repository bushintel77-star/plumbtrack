import { request } from "./api";

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

export const integrationsApi = {
  health: () => request<IntegrationHealth>("/api/integrations/health"),
  deliveries: () => request<IntegrationDelivery[]>("/api/integrations/deliveries"),
  retry: (id: string) => request<{ queued: boolean; id: string }>(`/api/integrations/deliveries/${id}/retry`, { method: "POST" }),
};
