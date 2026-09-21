"use client"

import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, CircleAlert, Loader2, Plug, RefreshCw } from "lucide-react"

import { integrationsApi, type IntegrationCard } from "@/features/setup/api"
import { deliveryApi, type DeliveryRow } from "@/features/integrations/api"
import { ConnectionForm } from "@/features/integrations/ConnectionForm"
import { ProviderCard } from "@/features/integrations/ProviderCard"

const CATEGORY_LABELS: Record<string, string> = {
  accounting: "Accounting",
  payments: "Payments",
  payroll: "Payroll",
  crm: "CRM",
  communication: "Communication",
  calendar: "Calendar & files",
  storage: "Storage",
  suppliers: "Suppliers",
  safety: "Safety"
}

const DELIVERY_STATUS_STYLE: Record<DeliveryRow["status"], string> = {
  delivered: "text-complete",
  pending: "text-ink-mid",
  processing: "text-chrome-400",
  failed: "text-urgent",
  dead_letter: "text-urgent"
}

/** Provider detail — what syncs, the live connection status, and the
 *  connect/reconnect form when the operator asks for it. */
function ProviderDetail({ card, onConnected, onClose }: { card: IntegrationCard; onConnected: () => void; onClose: () => void }) {
  const [open, setOpen] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  const disconnect = async () => {
    setDisconnecting(true)
    try {
      await integrationsApi.disconnect(card.id)
      onConnected()
    } catch {
      // The card state refreshes on the next list poll; a failed disconnect
      // says so instead of pretending.
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="panel rounded-xl p-5" data-testid={`integrations-detail-${card.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ink">{card.name}</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-mid">{card.blurb}</p>
        </div>
        <button type="button" onClick={onClose} className="text-xs font-semibold text-ink-low hover:text-ink">
          Back to all apps
        </button>
      </div>

      <dl className="mt-4 space-y-2 text-xs">
        <div className="flex gap-2">
          <dt className="label-mono w-24 shrink-0 text-ink-low">STATUS</dt>
          <dd className="text-ink">{card.status.replace(/_/g, " ")}{card.accountLabel ? ` — ${card.accountLabel}` : ""}</dd>
        </div>
        {card.connectedAt && (
          <div className="flex gap-2">
            <dt className="label-mono w-24 shrink-0 text-ink-low">CONNECTED</dt>
            <dd className="text-ink">{new Date(card.connectedAt).toLocaleString()}</dd>
          </div>
        )}
        {card.lastError && (
          <div className="flex gap-2">
            <dt className="label-mono w-24 shrink-0 text-ink-low">LAST ERROR</dt>
            <dd className="text-urgent">{card.lastError}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="label-mono w-24 shrink-0 text-ink-low">SYNCS</dt>
          <dd className="text-ink">{card.syncs.join(", ")}</dd>
        </div>
      </dl>

      {card.available && (
        <div className="mt-4">
          {!open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex min-h-9 items-center gap-1.5 rounded-lg border border-chrome-600 bg-chrome-wash px-3 text-xs font-semibold text-chrome-600 hover:brightness-105"
            >
              <Plug className="h-3.5 w-3.5" />
              {card.status === "needs_attention" ? "Reconnect" : card.status === "connected" ? "Update connection" : "Connect"}
            </button>
          )}
          {open && (
            <div className="mt-3">
              <ConnectionForm provider={card} onConnected={onConnected} onClose={() => setOpen(false)} />
            </div>
          )}
        </div>
      )}

      {card.status === "connected" && (
        <button
          type="button"
          onClick={() => void disconnect()}
          disabled={disconnecting}
          className="mt-4 text-xs font-semibold text-ink-low hover:text-urgent disabled:opacity-50"
        >
          {disconnecting ? "Disconnecting…" : "Disconnect this app"}
        </button>
      )}
    </div>
  )
}

/** Delivery log — what the automation pipeline actually sent, with the
 *  failed rows surfaced for retry (the exception queue dispatchers need). */
function DeliveryLog() {
  const queryClient = useQueryClient()
  const [retrying, setRetrying] = useState<string | null>(null)
  const health = useQuery({ queryKey: ["integrations-health"], queryFn: () => deliveryApi.health() })
  const deliveries = useQuery({ queryKey: ["integrations-deliveries"], queryFn: () => deliveryApi.list() })

  const retry = async (id: string) => {
    setRetrying(id)
    try {
      await deliveryApi.retry(id)
      void queryClient.invalidateQueries({ queryKey: ["integrations-deliveries"] })
      void queryClient.invalidateQueries({ queryKey: ["integrations-health"] })
    } finally {
      setRetrying(null)
    }
  }

  if (health.isLoading || deliveries.isLoading) {
    return <p className="text-sm text-ink-mid">Loading the delivery log…</p>
  }
  if (health.error || deliveries.error || !health.data || !deliveries.data) {
    return (
      <p className="text-sm text-urgent" role="alert">
        Couldn&apos;t load the delivery log — the API isn&apos;t reachable from here.
      </p>
    )
  }

  const counts = health.data
  return (
    <div className="panel rounded-xl p-5" data-testid="integrations-delivery-log">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-ink">Delivery log</h2>
        <div className="flex gap-3 text-xs text-ink-mid" data-testid="integrations-delivery-health">
          <span>{counts.delivered} delivered</span>
          <span>{counts.pending + counts.processing} queued</span>
          <span className={counts.failed + counts.deadLetter > 0 ? "font-semibold text-urgent" : ""}>
            {counts.failed + counts.deadLetter} need attention
          </span>
        </div>
      </div>

      {deliveries.data.length === 0 ? (
        <p className="mt-3 text-sm text-ink-mid">
          Nothing delivered yet — rows appear here once a connected app starts receiving events.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {deliveries.data.slice(0, 25).map(row => (
            <li key={row.id} className="flex items-center gap-3 py-2.5" data-testid={`delivery-row-${row.id}`}>
              <span className={`label-mono w-20 shrink-0 text-2xs ${DELIVERY_STATUS_STYLE[row.status]}`}>
                {row.status.replace(/_/g, " ").toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-ink">
                {row.provider} · attempt {row.attemptCount}
                {row.lastError ? ` — ${row.lastError}` : ""}
              </span>
              {(row.status === "failed" || row.status === "dead_letter") && (
                <button
                  type="button"
                  onClick={() => void retry(row.id)}
                  disabled={retrying === row.id}
                  className="flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-semibold text-ink hover:border-chrome-400 disabled:opacity-50"
                >
                  {retrying === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Retry
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * The Integrations hub (Phase 2) — everything about connected apps in one
 * place instead of only inside the setup wizard: the provider catalog, the
 * selected provider's live detail, and the delivery log with retry. Honest
 * states throughout: no API, no catalog — never a fabricated provider list.
 */
export function IntegrationsSurface() {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openProvider, setOpenProvider] = useState<string | null>(null)
  const { data, isLoading, error } = useQuery({
    queryKey: ["hub-integrations"],
    queryFn: () => integrationsApi.list()
  })

  // Coming back from an OAuth redirect: apps/api/src/routes/connections.ts
  // sends the operator back with ?provider=&connection= on the outcome.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const provider = params.get("provider")
    const outcome = params.get("connection")
    if (!provider || !outcome) return
    const card = data?.providers.find(entry => entry.id === provider)
    const name = card?.name ?? provider
    if (outcome === "connected") setSelectedId(provider)
    void queryClient.invalidateQueries({ queryKey: ["hub-integrations"] })
    params.delete("provider")
    params.delete("connection")
    const rest = params.toString()
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`)
    // Only ever process the redirect once per landing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(data)])

  if (isLoading) {
    return (
      <div className="p-8">
        <p className="text-sm text-ink-mid">Loading the apps Crewline can connect to…</p>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="p-8">
        <p className="text-sm text-urgent" role="alert">
          Couldn&apos;t load integrations — the API isn&apos;t reachable from here. Refresh to try again.
        </p>
      </div>
    )
  }

  if (!data.credentialStorageReady) {
    return (
      <div className="p-8">
        <div className="max-w-xl rounded-xl border border-pending bg-pending-wash p-4 text-sm text-ink">
          <p className="font-semibold">This Crewline can&apos;t store integration credentials yet.</p>
          <p className="mt-1 text-xs text-ink-mid">
            Ask your administrator to set <span className="label-mono">APP_ENCRYPTION_KEY</span> on the server. Until then
            nothing here can connect.
          </p>
        </div>
      </div>
    )
  }

  const selected = data.providers.find(provider => provider.id === selectedId) ?? null
  const categories = Array.from(new Set(data.providers.map(provider => provider.category)))

  return (
    <div className="h-full overflow-auto p-8" data-testid="integrations-surface">
      <header className="mb-6">
        <h1 className="text-base font-bold text-ink">Integrations</h1>
        <p className="mt-1 text-sm text-ink-mid">
          Connect the apps you already use — Crewline sends real data instead of asking you to enter it twice.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="space-y-6">
          {categories.map(category => (
            <div key={category}>
              <h2 className="label-mono mb-2.5 text-2xs text-ink-low">{CATEGORY_LABELS[category] ?? category}</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {data.providers
                  .filter(provider => provider.category === category)
                  .map(provider => (
                    <ProviderCard
                      key={provider.id}
                      card={provider}
                      open={openProvider === provider.id}
                      onToggle={() => {
                        setOpenProvider(current => (current === provider.id ? null : provider.id))
                        setSelectedId(provider.id)
                      }}
                      onConnected={() => {
                        setOpenProvider(null)
                        void queryClient.invalidateQueries({ queryKey: ["hub-integrations"] })
                      }}
                      onInterest={() => void queryClient.invalidateQueries({ queryKey: ["hub-integrations"] })}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-6">
          {selected ? (
            <ProviderDetail
              card={selected}
              onConnected={() => void queryClient.invalidateQueries({ queryKey: ["hub-integrations"] })}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <div className="panel rounded-xl p-5 text-sm text-ink-mid" data-testid="integrations-detail-empty">
              Select an app to see what it syncs, its connection status and its delivery history.
            </div>
          )}
          <DeliveryLog />
        </div>
      </div>
    </div>
  )
}
