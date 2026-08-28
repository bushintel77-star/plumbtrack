"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { formatMoney, quoteTotal } from "@/lib/format"
import { useBoardStore, useJobsList } from "@/stores/boardStore"

export function ClosedLoopHub() {
  const jobs = useJobsList()
  const dataMode = useBoardStore(s => s.dataMode)
  const stats = useMemo(() => {
    const active = jobs.filter(job => job.status === "active").length
    const awaitingQuote = jobs.filter(job => job.quote.status === "draft").length
    const quoteValue = jobs.reduce((sum, job) => sum + quoteTotal(job.quote.lineItems), 0)
    const compliance = jobs.reduce((sum, job) => sum + job.documents.length, 0)
    return { active, awaitingQuote, quoteValue, compliance }
  }, [jobs])

  return (
    <section className="border-b border-line bg-void-95 px-4 py-3" data-testid="closed-loop-hub">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="label-mono text-2xs text-chrome-400">FIELDLOOP CLOSED LOOP</div>
          <p className="mt-1 text-xs text-ink-mid">One operational thread from field activity to customer payment.</p>
        </div>
        <span className="label-mono rounded-full border border-line px-2 py-1 text-2xs text-ink-low">
          {dataMode === "live" ? "LIVE API" : "DEMO DATA"}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Active field jobs", stats.active.toString()],
          ["Quotes awaiting action", stats.awaitingQuote.toString()],
          ["Visible quote value", formatMoney(stats.quoteValue)],
          ["Compliance files", stats.compliance.toString()]
        ].map(([label, value]) => (
          <div key={label} className="panel px-3 py-2">
            <div className="label-mono text-2xs text-ink-low">{label}</div>
            <div className="tnum mt-1 text-sm font-bold text-ink">{value}</div>
          </div>
        ))}
      </div>


    </section>
  )
}
