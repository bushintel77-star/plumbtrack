"use client"

import { CreditCard } from "lucide-react"

import { formatMoney } from "@/lib/format"
import { marginRow, marginTotals } from "@/lib/fieldloop"
import { cn } from "@/lib/utils"
import { useJobsList } from "@/stores/boardStore"

import { HonestAction } from "./common"

export function ReportsSurface() {
  const jobs = useJobsList()
  const rows = jobs.map(marginRow)
  const totals = marginTotals(jobs)

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

      <aside className="fl-panel fl-inspector" aria-label="Reporting notes">
        <div className="fl-kicker">How these numbers are built</div>
        <p>Revenue is the sum of quoted line items on each job.</p>
        <p>Cost is only the outlay the office has actually recorded against a job.</p>
        <p>Jobs that have not completed are marked as estimates.</p>
        <HonestAction requirement="Stripe or an equivalent payment provider" icon={<CreditCard size={13} />}>
          Collect payment on open invoices
        </HonestAction>
      </aside>
    </>
  )
}
