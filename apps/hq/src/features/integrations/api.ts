import { apiGet, apiRequest } from "@/lib/api"

/**
 * Integrations hub client (Phase 2) — the delivery log and health probes
 * behind apps/api/src/routes/integrations.ts. Provider connect/disconnect
 * calls live in features/setup/api.ts and are shared with the setup wizard.
 */

export interface DeliveryAttempt {
  id: string
  attemptNumber: number
  status: string
  httpStatus: number | null
  providerMessageId: string | null
  error: string | null
  startedAt: string
  finishedAt: string | null
}

export interface DeliveryRow {
  id: string
  orgId: string
  provider: string
  status: "pending" | "processing" | "delivered" | "failed" | "dead_letter"
  attemptCount: number
  nextAttemptAt: string
  lastError: string | null
  providerMessageId: string | null
  deliveredAt: string | null
  createdAt: string
  attempts: DeliveryAttempt[]
}

export interface DeliveryHealth {
  pending: number
  processing: number
  failed: number
  deadLetter: number
  delivered: number
  needsAttention: boolean
}

export const deliveryApi = {
  list: (params: { provider?: string; status?: string } = {}) => {
    const search = new URLSearchParams(
      Object.entries(params).filter(([, value]) => Boolean(value)) as [string, string][]
    ).toString()
    return apiGet<DeliveryRow[]>(`/api/integrations/deliveries${search ? `?${search}` : ""}`)
  },
  health: () => apiGet<DeliveryHealth>("/api/integrations/health"),
  retry: (id: string) =>
    apiRequest<{ queued: boolean; id: string }>(`/api/integrations/deliveries/${id}/retry`, {
      method: "POST",
      body: JSON.stringify({})
    })
}
