"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { ProviderCard } from "@/features/integrations/ProviderCard"
import { integrationsApi } from "@/features/setup/api"
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

/**
 * Setup step 9 — the integrations launchpad, reused as a wizard question. An
 * operator can connect real providers here or skip to Team admin/Settings
 * later; nothing here is required to launch. The provider card itself lives
 * in features/integrations (shared with the Integrations hub).
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
        Nothing here is required; connect what applies now and add the rest later from{" "}
        <Link className="font-semibold text-chrome-600 hover:underline" href="/?module=integrations">
          the Integrations hub
        </Link>
        .
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
