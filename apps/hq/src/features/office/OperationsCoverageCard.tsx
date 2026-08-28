"use client"

import { useMemo } from "react"
import { Activity, BriefcaseBusiness, CheckCircle2, CreditCard, FileText, MessageSquare, ShieldCheck, Users } from "lucide-react"
import { useBoardStore, useJobsList } from "@/stores/boardStore"
import { useQuery } from "@tanstack/react-query"
import { apiGet } from "@/lib/api"

interface Capability {
  id: string
  label: string
  detail: string
  icon: typeof Activity
  state: "ready" | "attention" | "boundary"
  value: string
}

export function OperationsCoverageCard() {
  const jobs = useJobsList()
  const dataMode = useBoardStore(s => s.dataMode)
  const integrationHealth = useQuery({ queryKey: ["integration-health"], queryFn: () => apiGet<{ needsAttention: boolean; failed: number; deadLetter: number }>("/api/integrations/health"), enabled: dataMode === "live", refetchInterval: 15000 })
  const stats = useMemo(() => ({
    jobs: jobs.length,
    timers: jobs.filter(job => job.timerRunning).length,
    quotes: jobs.filter(job => job.quote.status === "draft").length,
    documents: jobs.reduce((sum, job) => sum + job.documents.length, 0),
    assigned: jobs.filter(job => job.techId).length
  }), [jobs])

  const capabilities: Capability[] = [
    { id: "dispatch", label: "Dispatch", detail: "Jobs, crews, schedule and constraints", icon: Activity, state: "ready", value: `${stats.jobs} jobs` },
    { id: "field", label: "Field telemetry", detail: "Timers, GPS and live status", icon: CheckCircle2, state: stats.timers ? "ready" : "attention", value: `${stats.timers} live` },
    { id: "crm", label: "CRM", detail: "Customers, properties and appointments", icon: Users, state: "boundary", value: "API linked" },
    { id: "quotes", label: "Quotes & accounting", detail: "Quote lines, approvals and totals", icon: BriefcaseBusiness, state: stats.quotes ? "attention" : "ready", value: `${stats.quotes} drafts` },
    { id: "payments", label: "Payments", detail: "Stripe payment-link workflow", icon: CreditCard, state: "boundary", value: "Server action" },
    { id: "documents", label: "Documents & RFIs", detail: "Vault, versions, media and compliance", icon: FileText, state: stats.documents ? "ready" : "attention", value: `${stats.documents} files` },
    { id: "slack", label: "Slack", detail: "Notifications, delivery and FSM events", icon: MessageSquare, state: integrationHealth.data?.needsAttention ? "attention" : dataMode === "live" ? "ready" : "boundary", value: integrationHealth.data ? `${integrationHealth.data.failed + integrationHealth.data.deadLetter} failed` : "Integration" },
    { id: "security", label: "Auth & audit", detail: "Tenant roles, sessions and audit trail", icon: ShieldCheck, state: "ready", value: dataMode === "live" ? "Authenticated" : "Demo session" }
  ]

  return (
    <section className="panel mx-4 mb-3 p-3" data-testid="operations-coverage">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="label-mono text-2xs text-chrome-400">OPERATIONS COVERAGE</div>
          <p className="mt-1 text-xs text-ink-mid">Every backend surface has a visible operational entry point.</p>
        </div>
        <span className="label-mono text-2xs text-ink-low">{stats.assigned}/{stats.jobs || 0} ASSIGNED</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        {capabilities.map(capability => {
          const Icon = capability.icon
          const tone = capability.state === "attention" ? "text-pending" : capability.state === "boundary" ? "text-ink-low" : "text-chrome-400"
          return (
            <div key={capability.id} className="rounded-lg border border-line bg-recess/70 p-2.5" data-testid={`coverage-${capability.id}`}>
              <div className="flex items-center gap-2">
                <Icon className={`h-3.5 w-3.5 ${tone}`} aria-hidden="true" />
                <span className="truncate text-xs font-semibold">{capability.label}</span>
              </div>
              <p className="mt-1 min-h-7 text-[10px] leading-3.5 text-ink-low">{capability.detail}</p>
              <div className={`label-mono mt-2 text-[10px] ${tone}`}>{capability.value}</div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
