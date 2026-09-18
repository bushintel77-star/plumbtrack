"use client"

import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Bell, Check, CircleAlert, Loader2, Plug } from "lucide-react"

import { cn } from "@/lib/utils"
import { ConnectionForm } from "../ConnectionForm"
import { integrationsApi, readableError, type IntegrationCard } from "../api"
import { toast } from "@/hooks/use-toast"

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

function statusBadge(card: IntegrationCard) {
  if (card.status === "connected") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold text-complete">
        <Check className="h-3.5 w-3.5" /> Connected{card.accountLabel ? ` · ${card.accountLabel}` : ""}
      </span>
    )
  }
  if (card.status === "needs_attention") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold text-pending">
        <CircleAlert className="h-3.5 w-3.5" /> Needs attention{card.lastError ? ` — ${card.lastError}` : ""}
      </span>
    )
  }
  return null
}

function ProviderCard({
  card,
  open,
  onToggle,
  onConnected,
  onInterest
}: {
  card: IntegrationCard
  open: boolean
  onToggle: () => void
  onConnected: (accountLabel: string | null) => void
  onInterest: () => void
}) {
  const [registering, setRegistering] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const registerInterest = async () => {
    setRegistering(true)
    setActionError(null)
    try {
      await integrationsApi.registerInterest(card.id)
      onInterest()
    } catch (error) {
      setActionError(readableError(error, "Couldn't save that — try again."))
    } finally {
      setRegistering(false)
    }
  }

  const disconnect = async () => {
    setDisconnecting(true)
    try {
      await integrationsApi.disconnect(card.id)
      onConnected(null)
    } catch (error) {
      setActionError(readableError(error, "Couldn't disconnect — try again."))
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="panel rounded-xl p-4" data-testid={`integration-card-${card.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-ink">{card.name}</h3>
            {card.minutes ? <span className="label-mono text-2xs text-ink-low">~{card.minutes} MIN</span> : null}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink-mid">{card.blurb}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {card.syncs.map(sync => (
              <span key={sync} className="label-mono rounded-full bg-recess px-2 py-0.5 text-[10px] text-ink-low">
                {sync}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {statusBadge(card)}
        {actionError && <span className="text-xs font-semibold text-urgent">{actionError}</span>}

        {card.available && card.status !== "connected" && card.status !== "needs_attention" && !open && (
          <button
            type="button"
            onClick={onToggle}
            className="ml-auto flex min-h-9 items-center gap-1.5 rounded-lg border border-chrome-600 bg-chrome-wash px-3 text-xs font-semibold text-chrome-600 hover:brightness-105"
          >
            <Plug className="h-3.5 w-3.5" /> Connect
          </button>
        )}
        {card.available && card.status === "needs_attention" && !open && (
          <button
            type="button"
            onClick={onToggle}
            className="ml-auto flex min-h-9 items-center gap-1.5 rounded-lg border border-pending bg-pending-wash px-3 text-xs font-semibold text-pending hover:brightness-105"
          >
            <Plug className="h-3.5 w-3.5" /> Reconnect
          </button>
        )}
        {card.status === "connected" && (
          <button
            type="button"
            onClick={() => void disconnect()}
            disabled={disconnecting}
            className="ml-auto text-xs font-semibold text-ink-low hover:text-urgent disabled:opacity-50"
          >
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </button>
        )}
        {!card.available && (
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-ink-low">{card.unavailableReason ?? "Not available yet."}</span>
            {card.authType === "none" && (
              <button
                type="button"
                onClick={() => void registerInterest()}
                disabled={registering || card.interestRegistered}
                className={cn(
                  "flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold disabled:opacity-70",
                  card.interestRegistered ? "border-line text-ink-low" : "border-chrome-600 bg-chrome-wash text-chrome-600 hover:brightness-105"
                )}
              >
                {registering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
                {card.interestRegistered ? "We'll let you know" : "Notify me when it's ready"}
              </button>
            )}
          </div>
        )}
      </div>

      {open && card.available && (
        <div className="mt-4">
          <ConnectionForm provider={card} onConnected={onConnected} onClose={onToggle} />
        </div>
      )}
    </div>
  )
}

/**
 * Setup step 9 — the integrations launchpad, reused as a wizard question. An
 * operator can connect real providers here or skip to Team admin/Settings
 * later; nothing here is required to launch.
 */
export function IntegrationsStep() {
  const queryClient = useQueryClient()
  const [openProvider, setOpenProvider] = useState<string | null>(null)
  const { data, isLoading, error } = useQuery({
    queryKey: ["setup-integrations"],
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
    if (outcome === "connected") toast({ title: `Connected to ${name}` })
    else if (outcome === "denied") toast({ title: `Connection to ${name} was declined`, description: "Nothing was connected." })
    else toast({ title: `Couldn't connect to ${name}`, description: "Try again, or check with your administrator.", variant: "destructive" })
    void queryClient.invalidateQueries({ queryKey: ["setup-integrations"] })
    params.delete("provider")
    params.delete("connection")
    const rest = params.toString()
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`)
    // Only ever process the redirect once per landing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(data)])

  if (isLoading) {
    return <p className="py-6 text-sm text-ink-mid">Loading the apps Crewline can connect to…</p>
  }
  if (error || !data) {
    return <p className="py-6 text-sm text-urgent">Couldn&apos;t load integrations. Refresh the page to try again.</p>
  }

  if (!data.credentialStorageReady) {
    return (
      <div className="rounded-xl border border-pending bg-pending-wash p-4 text-sm text-ink">
        <p className="font-semibold">This Crewline can&apos;t store integration credentials yet.</p>
        <p className="mt-1 text-xs text-ink-mid">
          Ask your administrator to set <span className="label-mono">APP_ENCRYPTION_KEY</span> on the server. You can skip this
          step for now and come back once it&apos;s set up.
        </p>
      </div>
    )
  }

  const categories = Array.from(new Set(data.providers.map(provider => provider.category)))

  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-mid">
        Connect the apps you already use — Crewline will start sending real data instead of asking you to enter it twice.
        Nothing here is required; connect what applies now and add the rest later from Settings.
      </p>
      {categories.map(category => (
        <div key={category}>
          <h3 className="label-mono mb-2.5 text-2xs text-ink-low">{CATEGORY_LABELS[category] ?? category}</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {data.providers
              .filter(provider => provider.category === category)
              .map(provider => (
                <ProviderCard
                  key={provider.id}
                  card={provider}
                  open={openProvider === provider.id}
                  onToggle={() => setOpenProvider(current => (current === provider.id ? null : provider.id))}
                  onConnected={() => {
                    setOpenProvider(null)
                    void queryClient.invalidateQueries({ queryKey: ["setup-integrations"] })
                  }}
                  onInterest={() => void queryClient.invalidateQueries({ queryKey: ["setup-integrations"] })}
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}
