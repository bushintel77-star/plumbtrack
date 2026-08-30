"use client"

import { useState } from "react"
import { CalendarClock, Mail, MapPin, Search } from "lucide-react"

import { serviceAgreements } from "@/data/seed"
import { formatDate, formatMoney } from "@/lib/format"
import { agreementVerdict, deriveCustomers, dispatchStatus, jobRevenue } from "@/lib/fieldloop"
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
  const agreement = serviceAgreements.find(item => item.customerName === selected?.name)
  const dueSoon = serviceAgreements
    .map(item => ({ item, verdict: agreementVerdict(item) }))
    .filter(entry => entry.verdict.state !== "valid")
    .sort((a, b) => (a.verdict.days ?? 0) - (b.verdict.days ?? 0))

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

            {agreement ? (
              <div className="fl-agreement">
                <strong>{agreement.serviceType}</strong>
                <span>
                  {agreement.frequency} · last serviced {formatDate(agreement.lastServiceDate)}
                </span>
                <span>Next due {formatDate(agreement.nextDueDate)}</span>
              </div>
            ) : (
              <div className="fl-muted">No service agreement on file for this customer.</div>
            )}

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
        {dueSoon.length === 0 && <div className="fl-muted">No agreements are due in the next 30 days.</div>}
        {dueSoon.map(({ item, verdict }) => (
          <button
            type="button"
            key={item.id}
            className={cn("fl-flag", verdict.state === "expired" ? "red" : "amber")}
            onClick={() => {
              const match = customers.find(customer => customer.name === item.customerName)
              if (match) setSelectedId(match.id)
            }}
          >
            <CalendarClock size={14} />
            <div>
              <strong>{item.customerName}</strong>
              <span>
                {item.serviceType} · {verdict.label}
              </span>
            </div>
          </button>
        ))}
        <HonestAction requirement="Twilio or an equivalent SMS provider" icon={<Mail size={13} />}>
          Send renewal reminders
        </HonestAction>
      </aside>
    </>
  )
}
