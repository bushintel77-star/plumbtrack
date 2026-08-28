"use client"

import { CheckCircle2, Plus, Send } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { formatMoney, quoteTotal } from "@/lib/format"
import { missingQuoteFields, useBoardStore } from "@/stores/boardStore"
import type { Job, QuoteStatus } from "@/types"
import { performMarkApproved, performMarkSent } from "@/features/board/actions"

const STATUS_STYLES: Record<QuoteStatus, string> = {
  draft: "border-line bg-fill text-ink-mid",
  ready: "border-chrome-400 bg-chrome-wash text-chrome-400",
  sent: "border-transparent bg-chrome-600 text-on-accent",
  approved: "border-complete bg-complete-wash text-complete"
}

export function QuotePanel({ job }: { job: Job }) {
  const setQuoteClient = useBoardStore(s => s.setQuoteClient)
  const addQuoteLineItem = useBoardStore(s => s.addQuoteLineItem)

  const quote = job.quote
  const missing = missingQuoteFields(quote)
  const invalid = missing.length > 0

  return (
    <section className="rounded-lg border border-white/10 bg-white/5 p-3" data-testid="quote-panel">
      <div className="flex items-center justify-between">
        <h3 className="label-mono text-2xs text-ink-low">QUOTE STATUS</h3>
        <Badge
          data-testid="quote-status"
          className={cn("label-mono rounded-sm border text-2xs", STATUS_STYLES[quote.status])}
        >
          {quote.status}
        </Badge>
      </div>

      {invalid && (
        <div
          data-testid="quote-validation"
          className="mt-2.5 flex items-start gap-2 rounded-md border border-pending bg-pending-wash px-2.5 py-2 text-[11px] leading-relaxed text-pending"
        >
          <span className="mt-px font-bold">⚠</span>
          <span>
            Blocked from <span className="font-bold">SENT</span> — missing{" "}
            {missing.join(" and ")}. Complete the quote to release it.
          </span>
        </div>
      )}

      <div className="mt-2.5 space-y-1.5">
        <label className="label-mono text-2xs text-ink-low">CLIENT NAME</label>
        <Input
          data-testid="quote-client-input"
          value={quote.clientName ?? ""}
          placeholder="Required before sending"
          onChange={e => setQuoteClient(job.id, e.target.value)}
          className="h-8 border-line bg-recess text-xs"
        />
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between">
          <label className="label-mono text-2xs text-ink-low">LINE ITEMS</label>
          <Button
            variant="ghost"
            size="sm"
            data-testid="quote-add-item"
            className="label-mono h-6 gap-1 px-2 text-2xs text-chrome-400"
            onClick={() => addQuoteLineItem(job.id)}
          >
            <Plus className="h-3 w-3" />
            ADD ITEM
          </Button>
        </div>

        {(!quote.lineItems || quote.lineItems.length === 0) && (
          <p className="mt-1.5 rounded-md border border-dashed border-line px-2.5 py-3 text-center text-[11px] text-ink-low">
            No line items — a quote cannot be sent without at least one.
          </p>
        )}

        {quote.lineItems && quote.lineItems.length > 0 && (
          <ul className="mt-1.5 space-y-1">
            {quote.lineItems.map(item => (
              <li
                key={item.id}
                className="grid grid-cols-[minmax(0,1fr)_52px_78px] items-center gap-1 rounded-md bg-recess px-2 py-1.5"
              >
                <span className="min-w-0 truncate text-[11px] text-ink-mid" title={item.description}>
                  {item.description}
                </span>
                <span className="label-mono tnum text-right text-2xs text-ink-low">
                  {item.qty} ×
                </span>
                <span className="tnum text-right text-[11px] font-semibold">
                  {formatMoney(item.qty * item.unitPrice)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Separator className="my-2.5 bg-line" />

      <div className="flex items-center justify-between">
        <span className="label-mono text-2xs text-ink-low">QUOTE TOTAL</span>
        <span
          data-testid="quote-total"
          className="tnum font-mono text-base font-bold tracking-tight"
        >
          {formatMoney(quoteTotal(quote.lineItems))}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          size="sm"
          variant="secondary"
          data-testid="quote-mark-sent"
          className="w-full gap-1.5"
          onClick={() => performMarkSent(job.id)}
        >
          <Send className="h-3.5 w-3.5" />
          Mark Sent
        </Button>
        <Button
          size="sm"
          variant="secondary"
          data-testid="quote-mark-approved"
          disabled={quote.status !== "sent"}
          className="w-full gap-1.5"
          onClick={() => performMarkApproved(job.id)}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Approve
        </Button>
      </div>
    </section>
  )
}
