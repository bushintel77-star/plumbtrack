"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Mail, MapPin, Phone, Search } from "lucide-react"

import { apiGet } from "@/lib/api"
import { formatDate, formatMoney } from "@/lib/format"
import { dispatchStatus, jobRevenue } from "@/lib/fieldloop"
import { cn } from "@/lib/utils"
import { useJobsList } from "@/stores/boardStore"

import { Avatar, StatusChip } from "./common"

/** Real CRM records from /api/customers (customers + their properties). */
interface CrmCustomer {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  properties?: Array<{ id: string; address: string; accessCode?: string | null }>
}
interface CrmAgreement {
  id: string
  serviceType: string
  frequency: string
  lastServiceDate: string | null
  nextDueDate: string
  active: boolean
}

function agreementVerdict(agreement: CrmAgreement): { state: "expired" | "expiring" | "valid"; label: string; days: number } {
  const days = Math.round((new Date(agreement.nextDueDate).getTime() - Date.now()) / 86400000)
  if (days < 0) return { state: "expired", label: `Overdue by ${Math.abs(days)}d`, days }
  if (days <= 30) return { state: "expiring", label: `Due in ${days}d`, days }
  return { state: "valid", label: `Due in ${days}d`, days }
}

export function CrmSurface() {
  const jobs = useJobsList()
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState("")

  // Live customer directory — /api/customers (customers + properties).
  const customersQuery = useQuery({
    queryKey: ["crm-customers"],
    queryFn: () => apiGet<CrmCustomer[]>("/api/customers"),
    refetchInterval: 30000
  })

  // Job history is matched from the live board by customer name (jobs carry
  // the free-text client field, not a customerId, in the current schema).
  const customers = useMemo(() => {
    const list = customersQuery.data ?? []
    return list.map(customer => ({
      ...customer,
      jobs: jobs.filter(job => job.client === customer.name)
    }))
  }, [customersQuery.data, jobs])

  const visible = customers.filter(customer =>
    customer.name.toLowerCase().includes(query.trim().toLowerCase())
  )
  const selected = customers.find(customer => customer.id === selectedId)

  // Agreements for the selected customer — fetched on selection.
  const agreementsQuery = useQuery({
    queryKey: ["crm-agreements", selectedId],
    queryFn: () => apiGet<CrmAgreement[]>(`/api/customers/${selectedId}/agreements`),
    enabled: Boolean(selectedId)
  })
  const agreements = agreementsQuery.data ?? []
  const dueSoon = agreements
    .filter(agreement => agreement.active && agreementVerdict(agreement).state !== "valid")
    .sort((a, b) => agreementVerdict(a).days - agreementVerdict(b).days)

  return (
    <>
      <aside className="fl-panel fl-tree" aria-label="Customers">
        <label className="fl-input">
          <Search size={13} />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Filter customers…"
            aria-label="Filter customers"
          />
        </label>
        <div className="fl-kicker">Customers</div>
        {customersQuery.isLoading && <div className="fl-muted">Loading live customers…</div>}
        {customersQuery.error && <div className="fl-muted">API unavailable — no live customer directory.</div>}
        {visible.map(customer => (
          <button
            type="button"
            key={customer.id}
            aria-pressed={selectedId === customer.id}
            className={cn("fl-category", selectedId === customer.id && "selected")}
            onClick={() => setSelectedId(customer.id)}
          >
            <Avatar name={customer.name} size="small" />
            {customer.name}
            <b>{customer.jobs.length}</b>
          </button>
        ))}
        {!customersQuery.isLoading && visible.length === 0 && <div className="fl-muted">No customers match “{query}”.</div>}
      </aside>

      <main className="fl-canvas">
        {!selected ? (
          <div className="fl-muted">Pick a customer to see their agreements and job history.</div>
        ) : (
          <>
            <div className="fl-customer">
              <Avatar name={selected.name} size="large" />
              <div>
                <h2>{selected.name}</h2>
                {selected.email && <p className="fl-muted"><Mail size={13} /> {selected.email}</p>}
                {selected.phone && <p className="fl-muted"><Phone size={13} /> {selected.phone}</p>}
                {(selected.properties ?? []).map(property => (
                  <p key={property.id} className="fl-muted">
                    <MapPin size={13} /> {property.address}
                    {property.accessCode ? ` · access ${property.accessCode}` : ""}
                  </p>
                ))}
              </div>
            </div>

            <div className="fl-kicker">Service agreements</div>
            {agreementsQuery.isLoading && <div className="fl-muted">Loading agreements…</div>}
            {!agreementsQuery.isLoading && agreements.length === 0 && (
              <div className="fl-muted">No service agreement on file for this customer.</div>
            )}
            {agreements.map(agreement => {
              const verdict = agreementVerdict(agreement)
              return (
                <div className="fl-history" key={agreement.id}>
                  <strong>{agreement.serviceType}</strong>
                  {!agreement.active && <span className="fl-muted">(inactive)</span>}
                  <span className="fl-muted">
                    {agreement.frequency} · next due {formatDate(agreement.nextDueDate)} ({verdict.label})
                  </span>
                </div>
              )
            })}

            <div className="fl-kicker">Job history</div>
            {selected.jobs.length === 0 && <div className="fl-muted">No jobs on the current board for this customer.</div>}
            {selected.jobs.map(job => (
              <div className="fl-history" key={job.id}>
                <strong>{job.title}</strong>
                <StatusChip status={dispatchStatus(job)} />
                <span className="fl-money">{formatMoney(jobRevenue(job))}</span>
              </div>
            ))}
          </>
        )}
      </main>

      <aside className="fl-panel fl-inspector" aria-label="Agreements due soon">
        <div className="fl-kicker">Agreements due soon</div>
        {!selectedId && <div className="fl-muted">Select a customer to check their agreement due dates.</div>}
        {selectedId && dueSoon.length === 0 && <div className="fl-muted">No agreements are due in the next 30 days.</div>}
        {dueSoon.map(agreement => {
          const verdict = agreementVerdict(agreement)
          return (
            <div className="fl-flag" key={agreement.id}>
              <strong>{agreement.serviceType}</strong>
              <span className="fl-muted">
                {verdict.label} · {formatDate(agreement.nextDueDate)}
              </span>
            </div>
          )
        })}
      </aside>
    </>
  )
}
