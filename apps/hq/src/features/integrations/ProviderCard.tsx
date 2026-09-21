"use client"

import { useState } from "react"
import { Bell, Check, CircleAlert, Loader2, Plug } from "lucide-react"

import { cn } from "@/lib/utils"
import { ConnectionForm } from "@/features/integrations/ConnectionForm"
import { integrationsApi, readableError, type IntegrationCard } from "@/features/setup/api"

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

/**
 * One provider card in the catalog — shared by the setup wizard's
 * integrations step and the Integrations hub (Phase 2). Connect opens the
 * inline ConnectionForm; a connected provider offers Disconnect; an
 * unavailable one offers the notify-me interest registration.
 */
export function ProviderCard({
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
