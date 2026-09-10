"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { CreditCard } from "lucide-react"

import { apiGet, apiRequest } from "@/lib/api"
import { formatMoney } from "@/lib/format"
import { marginRow, marginTotals, jobRevenue } from "@/lib/fieldloop"
import { cn } from "@/lib/utils"
import { useJobsList } from "@/stores/boardStore"

import { HonestAction } from "./common"

/** Jobs the office can actually collect on: completed, revenue recorded,
 *  and Stripe not already paid. */
interface PaymentLinkResponse {
  url: string
  mode: "live" | "test"
}

export function ReportsSurface() {
  const jobs = useJobsList()
  const rows = jobs.map(marginRow)
  const totals = marginTotals(jobs)
  const [links, setLinks] = useState<Record<string, PaymentLinkResponse>>({})

  const collectable = jobs.filter(
    job => job.status === "complete" && (job.paymentStatus ?? "unpaid") !== "paid"
  )

  const createLink = useMutation({
    mutationFn: async (jobId: string) => {
      const job = jobs.find(candidate => candidate.id === jobId)
      const amount = job ? jobRevenue(job) : 0
      return apiRequest<PaymentLinkResponse>(`/api/jobs/${jobId}/payment-link`, {
        method: "POST",
        body: JSON.stringify({ amount })
      })
    },
    onSuccess: (response, jobId) => {
      setLinks(current => ({ ...current, [jobId]: response }))
    }
  })

  return (
    <>
      <main className="fl-canvas">
        <div className="fl-canvas-toolbar">
          <div>
            <b>Revenue, cost and margin from recorded job data</b>
            <span> · costs are never inferred from a multiplier</span>
          </div>
        </div>

        <div className="fl-stat-row">
          <div className="fl-stat">
            <strong>{formatMoney(totals.revenue)}</strong>
            <span>REVENUE</span>
          </div>
          <div className={cn("fl-stat", totals.cost === null && "unknown")}>
            <strong>{totals.cost === null ? "—" : formatMoney(totals.cost)}</strong>
            <span>COST</span>
          </div>
          <div className={cn("fl-stat", totals.margin === null && "unknown")}>
            <strong>{totals.margin === null ? "—" : formatMoney(totals.margin)}</strong>
            <span>MARGIN</span>
          </div>
          <div className={cn("fl-stat", totals.marginPercent === null && "unknown")}>
            <strong>{totals.marginPercent === null ? "—" : `${totals.marginPercent}%`}</strong>
            <span>MARGIN %</span>
          </div>
        </div>

        {totals.missingCosts > 0 && (
          <p className="fl-notice" data-testid="fl-missing-costs">
            {totals.missingCosts} job{totals.missingCosts === 1 ? " has" : "s have"} no recorded
            cost, so total cost and margin are unavailable.
          </p>
        )}

        <table className="fl-table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Customer</th>
              <th>Revenue</th>
              <th>Cost</th>
              <th>Margin</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.job.id}>
                <td>
                  {row.job.title} {row.estimated && <em>estimate</em>}
                </td>
                <td>{row.job.client}</td>
                <td className="num">{formatMoney(row.revenue)}</td>
                <td className="num">{row.cost === null ? "not recorded" : formatMoney(row.cost)}</td>
                <td className="num">{row.margin === null ? "—" : formatMoney(row.margin)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>

      <aside className="fl-panel fl-inspector" aria-label="Payments">
        <div className="fl-kicker">Collect payment</div>
        <p className="fl-muted">
          Stripe Checkout links for completed jobs, priced from the quoted line items. Payment
          status updates automatically via the Stripe webhook.
        </p>
        {collectable.length === 0 ? (
          <div className="fl-muted">Nothing outstanding — every completed job is paid.</div>
        ) : (
          collectable.map(job => {
            const link = links[job.id]
            const amount = jobRevenue(job)
            return (
              <div className="fl-flag" key={job.id}>
                <strong>{job.title}</strong>
                <span className="fl-muted">
                  {job.client} · {formatMoney(amount)} · {job.paymentStatus ?? "unpaid"}
                </span>
                {link ? (
                  <a className="fl-download" href={link.url} target="_blank" rel="noreferrer">
                    Open {link.mode} checkout link
                  </a>
                ) : (
                  <button
                    type="button"
                    className="fl-download"
                    onClick={() => createLink.mutate(job.id)}
                    disabled={createLink.isPending}
                  >
                    <CreditCard size={13} />
                    {createLink.isPending ? "Creating…" : `Create payment link (${formatMoney(amount)})`}
                  </button>
                )}
              </div>
            )
          })
        )}
        {collectable.length === 0 && (
          <HonestAction requirement="a completed job with quoted revenue" icon={<CreditCard size={13} />}>
            Collect payment on open invoices
          </HonestAction>
        )}
      </aside>
    </>
  )
}
