"use client"

import { useState } from "react"
import { Mail, MapPin, Search } from "lucide-react"

import { formatMoney } from "@/lib/format"
import { deriveCustomers, dispatchStatus, jobRevenue } from "@/lib/fieldloop"
import { cn } from "@/lib/utils"
import { useJobsList } from "@/stores/boardStore"

import { Avatar, HonestAction, StatusChip } from "./common"

export function CrmSurface() {
  const jobs = useJobsList()
  const customers = deriveCustomers(jobs)
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState("")

  const visible = customers.filter(customer =>
    customer.name.toLowerCase().includes(query.trim().toLowerCase())
  )
  const selected = customers.find(customer => customer.id === selectedId)
  // Service agreements are not backed by the API yet. The hardcoded seed
  // used to render fictional contracts and "overdue" alerts into the live
  // CRM view — until a real agreements source exists these stay honest
  // empty states.


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
        {visible.length === 0 && <div className="fl-muted">No customers match “{query}”.</div>}
      </aside>

      <main className="fl-canvas">
        {!selected ? (
          <div className="fl-muted">Pick a customer to see their agreement and job history.</div>
        ) : (
          <>
            <div className="fl-customer">
              <Avatar name={selected.name} size="large" />
              <div>
                <h2>{selected.name}</h2>
                <p>
                  <MapPin size={13} />
                  {selected.address}
                </p>
              </div>
            </div>

            {/* Service agreements are not backed by the API yet — honest
                empty state until a real agreements source exists. */}
            <div className="fl-muted">No service agreement on file for this customer.</div>

            <div className="fl-kicker">Job history</div>
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
        <div className="fl-muted">No agreements are due in the next 30 days.</div>
        <HonestAction requirement="Twilio or an equivalent SMS provider" icon={<Mail size={13} />}>
          Send renewal reminders
        </HonestAction>
      </aside>
    </>
  )
}
