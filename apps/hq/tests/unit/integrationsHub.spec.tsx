import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

/**
 * The Integrations hub (Phase 2) — honest states pinned at the component
 * level with the API layer mocked: unreachable API renders the error state
 * (never a fabricated catalog), the unconfigured-credential banner names
 * APP_ENCRYPTION_KEY, and the delivery log renders health counts and retry
 * affordances only for failed rows.
 */

const { listState, deliveryList, deliveryHealth, deliveryRetry } = vi.hoisted(() => ({
  listState: vi.fn(),
  deliveryList: vi.fn(),
  deliveryHealth: vi.fn(),
  deliveryRetry: vi.fn(),
}))

vi.mock("@/features/setup/api", () => ({
  integrationsApi: {
    list: listState,
    test: vi.fn(),
    saveKey: vi.fn(),
    oauthStart: vi.fn(),
    registerInterest: vi.fn(),
    disconnect: vi.fn()
  },
  readableError: (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback)
}))

vi.mock("@/features/integrations/api", () => ({
  deliveryApi: {
    list: deliveryList,
    health: deliveryHealth,
    retry: deliveryRetry
  }
}))

import { IntegrationsSurface } from "@/features/integrations/IntegrationsSurface"

function renderSurface() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <IntegrationsSurface />
    </QueryClientProvider>
  )
}

const PROVIDER = {
  id: "xero",
  name: "Xero",
  category: "accounting",
  blurb: "Push invoices to the ledger.",
  syncs: ["Invoices"],
  authType: "oauth_pkce" as const,
  steps: ["Connect"],
  fields: [],
  docsUrl: null,
  minutes: 3,
  canTestConnection: false,
  available: true,
  unavailableReason: null,
  interestRegistered: false,
  status: "disconnected" as const,
  accountLabel: null,
  connectedAt: null,
  lastError: null
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("IntegrationsSurface", () => {
  it("renders the error state when the API is unreachable — never a fabricated catalog", async () => {
    listState.mockRejectedValue(new Error("down"))
    renderSurface()
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy())
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't load integrations/i)
    expect(screen.queryByTestId("integrations-surface")).toBeNull()
  })

  it("names the missing credential when storage is not configured", async () => {
    listState.mockResolvedValue({ credentialStorageReady: false, providers: [PROVIDER] })
    renderSurface()
    await waitFor(() => expect(screen.getByText(/can't store integration credentials yet/i)).toBeTruthy())
    expect(screen.getByText(/APP_ENCRYPTION_KEY/)).toBeTruthy()
  })

  it("renders the catalog, provider detail and delivery health when live", async () => {
    listState.mockResolvedValue({ credentialStorageReady: true, providers: [PROVIDER] })
    deliveryList.mockResolvedValue([
      {
        id: "del-1",
        orgId: "org",
        provider: "slack",
        status: "failed",
        attemptCount: 2,
        nextAttemptAt: new Date().toISOString(),
        lastError: "channel_not_found",
        providerMessageId: null,
        deliveredAt: null,
        createdAt: new Date().toISOString(),
        attempts: []
      }
    ])
    deliveryHealth.mockResolvedValue({ pending: 1, processing: 0, failed: 1, deadLetter: 0, delivered: 4, needsAttention: true })

    renderSurface()
    await waitFor(() => expect(screen.getByTestId("integrations-surface")).toBeTruthy())
    expect(screen.getByTestId("integration-card-xero")).toBeTruthy()
    // Delivery log: the failed row is visible with its retry control, and
    // the health strip counts what the pipeline actually did.
    await waitFor(() => expect(screen.getByTestId("integrations-delivery-log")).toBeTruthy())
    expect(screen.getByTestId("delivery-row-del-1").textContent).toMatch(/failed/i)
    expect(screen.getByTestId("integrations-delivery-health").textContent).toMatch(/4 delivered/)
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy()
  })
})
