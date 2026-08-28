"use client"

import { useQuery } from "@tanstack/react-query"
import { apiGet } from "@/lib/api"

interface Customer { id: string; name: string; email?: string | null; phone?: string | null }
interface Quote { id: string; client: string; status: string; lines?: Array<{ id: string; description: string; quantity?: number; unitPrice?: number }> }
interface Document { id: string; name: string; category: string; expiresOn?: string | null; currentVersion?: unknown }
interface Health { pending: number; processing: number; failed: number; deadLetter: number; delivered: number; needsAttention: boolean }

function DataCard({ title, value, detail, testId }: { title: string; value: string; detail: string; testId: string }) {
  return <section className="panel p-3" data-testid={testId}><div className="label-mono text-2xs text-ink-low">{title}</div><div className="tnum mt-2 text-xl font-bold">{value}</div><p className="mt-1 text-2xs text-ink-low">{detail}</p></section>
}

function QueryState({ loading, error }: { loading: boolean; error: unknown }) {
  if (loading) return <p className="text-xs text-ink-low">Loading live records…</p>
  if (error) return <p className="text-xs text-pending">API unavailable — configure HQ API connectivity to load live records.</p>
  return null
}

export function OperationsHub() {
  const customers = useQuery({ queryKey: ["hq-customers"], queryFn: () => apiGet<Customer[]>("/api/customers"), refetchInterval: 30000 })
  const quotes = useQuery({ queryKey: ["hq-quotes"], queryFn: () => apiGet<Quote[]>("/api/quotes"), refetchInterval: 30000 })
  const documents = useQuery({ queryKey: ["hq-documents"], queryFn: () => apiGet<Document[]>("/api/documents"), refetchInterval: 30000 })
  const health = useQuery({ queryKey: ["hq-integrations"], queryFn: () => apiGet<Health>("/api/integrations/health"), refetchInterval: 15000 })
  const draftQuotes = quotes.data?.filter(quote => quote.status === "draft").length ?? 0
  const expiringDocs = documents.data?.filter(document => document.expiresOn && new Date(document.expiresOn).getTime() - Date.now() < 30 * 86400000).length ?? 0

  return <div className="scrollbar-thin h-full overflow-auto p-4" data-testid="operations-hub"><div className="flex items-end justify-between"><div><div className="label-mono text-2xs text-chrome-400">HQ OPERATIONS HUB</div><h2 className="mt-1 text-lg font-bold">Closed-loop records</h2><p className="mt-1 text-xs text-ink-mid">Live CRM, accounting, compliance and integration health from the shared API.</p></div><span className="label-mono text-2xs text-ink-low">READ-THROUGH · 30S</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><DataCard title="CRM CUSTOMERS" value={customers.data ? String(customers.data.length) : "—"} detail="Customers and properties" testId="ops-customers" /><DataCard title="DRAFT QUOTES" value={quotes.data ? String(draftQuotes) : "—"} detail="Quote pipeline requiring action" testId="ops-quotes" /><DataCard title="DOCUMENTS" value={documents.data ? String(documents.data.length) : "—"} detail={expiringDocs ? `${expiringDocs} expiring within 30 days` : "Compliance vault"} testId="ops-documents" /><DataCard title="INTEGRATION QUEUE" value={health.data ? String(health.data.pending + health.data.failed + health.data.deadLetter) : "—"} detail={health.data?.needsAttention ? "Delivery attention required" : "Slack and integrations healthy"} testId="ops-integrations" /></div><div className="mt-4 grid gap-3 lg:grid-cols-2"><section className="panel p-3" data-testid="ops-crm-list"><h3 className="label-mono text-2xs text-ink-low">CUSTOMER DIRECTORY</h3><QueryState loading={customers.isLoading} error={customers.error} />{customers.data?.slice(0, 8).map(customer => <div key={customer.id} className="mt-2 flex items-center justify-between rounded-md bg-recess px-2.5 py-2 text-xs"><span className="font-semibold">{customer.name}</span><span className="text-ink-low">{customer.email ?? customer.phone ?? "No contact"}</span></div>)}</section><section className="panel p-3" data-testid="ops-quote-list"><h3 className="label-mono text-2xs text-ink-low">ACCOUNTING PIPELINE</h3><QueryState loading={quotes.isLoading} error={quotes.error} />{quotes.data?.slice(0, 8).map(quote => <div key={quote.id} className="mt-2 flex items-center justify-between rounded-md bg-recess px-2.5 py-2 text-xs"><span className="font-semibold">{quote.client}</span><span className="label-mono text-2xs text-chrome-400">{quote.status}</span></div>)}</section></div></div>
}
