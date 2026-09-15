import { apiGet, apiRequest } from "@/lib/api"

/** Guided setup + integration connections — the client half of
 *  apps/api/src/routes/setup.ts and routes/connections.ts. */

export const SETUP_STEPS = [
  "business",
  "team",
  "services",
  "area",
  "pricing",
  "comms",
  "compliance",
  "fieldapp",
  "integrations",
  "invite"
] as const

export type SetupStep = (typeof SETUP_STEPS)[number]

export interface SetupState {
  status: "in_progress" | "complete"
  currentStep: SetupStep
  completedSteps: SetupStep[]
  skippedSteps: SetupStep[]
  answers: Record<string, Record<string, unknown> | undefined>
  steps: SetupStep[]
  requiredSteps: SetupStep[]
  canLaunch: boolean
  progress: { done: number; total: number }
  startedAt: string
  launchedAt: string | null
}

export interface StepIssue {
  path: string
  message: string
}

export class StepValidationError extends Error {
  constructor(readonly issues: StepIssue[]) {
    super("Some answers need a moment")
    this.name = "StepValidationError"
  }
}

export interface AbnLookup {
  configured: boolean
  abn: string
  legalName: string | null
  tradingNames: string[]
  entityTypeName: string | null
  gstRegistered: boolean
  state: string | null
  postcode: string | null
}

export interface ProviderField {
  id: string
  label: string
  hint: string
  placeholder?: string
  secret: boolean
  pattern?: string
  patternHint?: string
}

export interface IntegrationCard {
  id: string
  name: string
  category: string
  blurb: string
  syncs: string[]
  authType: "oauth_pkce" | "api_key" | "managed" | "none"
  steps: string[]
  fields: ProviderField[]
  docsUrl: string | null
  minutes: number | null
  canTestConnection: boolean
  available: boolean
  unavailableReason: string | null
  interestRegistered: boolean
  status: "connected" | "needs_attention" | "disconnected" | "not_connected" | "unavailable"
  accountLabel: string | null
  connectedAt: string | null
  lastError: string | null
}

export interface IntegrationsState {
  credentialStorageReady: boolean
  providers: IntegrationCard[]
}

async function saveStep(input: {
  step: SetupStep
  answers: Record<string, unknown>
  intent: "draft" | "complete" | "skip"
  nextStep?: SetupStep
}): Promise<SetupState> {
  try {
    return await apiRequest<SetupState>("/api/setup/step", { method: "PUT", body: JSON.stringify(input) })
  } catch (error) {
    // The API answers a failed step with the specific fields to fix; surface
    // them on the inputs rather than as one generic banner.
    const message = error instanceof Error ? error.message : ""
    const match = /\{.*\}$/s.exec(message)
    if (match) {
      try {
        const body = JSON.parse(match[0]) as { issues?: StepIssue[] }
        if (body.issues?.length) throw new StepValidationError(body.issues)
      } catch (parsed) {
        if (parsed instanceof StepValidationError) throw parsed
      }
    }
    throw error
  }
}

export const setupApi = {
  state: () => apiGet<SetupState>("/api/setup"),
  saveStep,
  launch: () => apiRequest<SetupState>("/api/setup/launch", { method: "POST", body: JSON.stringify({ confirm: true }) }),
  lookupAbn: (abn: string) => apiGet<AbnLookup>(`/api/setup/abn/${encodeURIComponent(abn)}`)
}

export const integrationsApi = {
  list: () => apiGet<IntegrationsState>("/api/integrations"),
  test: (provider: string, fields: Record<string, string>) =>
    apiRequest<{ ok: boolean; accountLabel: string | null; checked: boolean }>(`/api/integrations/${provider}/test`, {
      method: "POST",
      body: JSON.stringify({ fields })
    }),
  saveKey: (provider: string, fields: Record<string, string>) =>
    apiRequest<{ status: string; provider: string; accountLabel: string | null; checked: boolean }>(
      `/api/integrations/${provider}/api-key`,
      { method: "POST", body: JSON.stringify({ fields }) }
    ),
  /** Returns the provider's own authorize URL (OAuth 2.0 + PKCE). */
  oauthStart: (provider: string, returnTo: string) =>
    apiGet<{ url: string }>(`/api/integrations/${provider}/oauth/start?returnTo=${encodeURIComponent(returnTo)}`),
  registerInterest: (provider: string) =>
    apiRequest<{ registered: boolean }>(`/api/integrations/${provider}/interest`, { method: "POST", body: JSON.stringify({}) }),
  disconnect: (provider: string) => apiRequest<void>(`/api/integrations/${provider}`, { method: "DELETE" })
}

/** The message an API error carries, without the "API /path failed (400):"
 *  prefix the client adds — what the operator should actually read. */
export function readableError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback
  const match = /\{.*\}$/s.exec(error.message)
  if (match) {
    try {
      const body = JSON.parse(match[0]) as { message?: string }
      if (body.message) return body.message
    } catch {
      // fall through to the generic message
    }
  }
  return fallback
}
