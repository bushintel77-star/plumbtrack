import { CheckCircle2, Plus, Send } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { formatMoney, quoteTotal } from '@/lib/format'
import { missingQuoteFields, useDispatchStore } from '@/store/dispatchStore'
import { useToast } from '@/hooks/use-toast'
import type { Job, QuoteStatus } from '@/types'

const STATUS_STYLES: Record<QuoteStatus, string> = {
  draft: 'border-white/10 bg-white/[0.04] text-muted-foreground',
  ready: 'border-primary/40 bg-primary/10 text-blue-400',
  sent: 'border-transparent bg-primary text-primary-foreground',
  approved: 'border-blue-300/40 bg-blue-500/25 text-blue-200'
}

export function QuotePanel({ job }: { job: Job }): JSX.Element {
  const setQuoteClient = useDispatchStore((s) => s.setQuoteClient)
  const addQuoteLineItem = useDispatchStore((s) => s.addQuoteLineItem)
  const markQuoteSent = useDispatchStore((s) => s.markQuoteSent)
  const markQuoteApproved = useDispatchStore((s) => s.markQuoteApproved)
  const { toast } = useToast()

  const quote = job.quote
  const missing = missingQuoteFields(quote)
  const invalid = missing.length > 0

  const handleMarkSent = (): void => {
    const result = markQuoteSent(job.id)
    if (!result.ok) {
      toast({
        variant: 'destructive',
        title: 'Quote blocked from SENT',
        description: result.reason
      })
      return
    }
    toast({
      title: 'Quote sent',
      description: `Financials dispatched to ${quote.clientName}.`
    })
  }

  const handleMarkApproved = (): void => {
    const result = markQuoteApproved(job.id)
    if (!result.ok) {
      toast({ variant: 'destructive', title: 'Cannot approve', description: result.reason })
      return
    }
    toast({ title: 'Quote approved', description: `${quote.clientName} signed off on the pricing.` })
  }

  return (
    <section className="dispatch-surface rounded-xl p-4" data-testid="quote-panel">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Quote Status
        </h3>
        <Badge
          data-testid="quote-status"
          className={cn('rounded-sm text-[9px] font-bold uppercase tracking-widest', STATUS_STYLES[quote.status])}
        >
          {quote.status}
        </Badge>
      </div>

      {invalid && (
        <div
          data-testid="quote-validation"
          className="mt-2.5 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/[0.06] px-2.5 py-2 text-[11px] leading-relaxed text-amber-300"
        >
          <span className="mt-px font-bold">⚠</span>
          <span>
            Blocked from <span className="font-semibold">SENT</span> — missing{' '}
            {missing.join(' and ')}. Complete the quote to release it.
          </span>
        </div>
      )}

      <div className="mt-2.5 space-y-1.5">
        <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Client name
        </label>
        <Input
          data-testid="quote-client-input"
          value={quote.clientName ?? ''}
          placeholder="Required before sending"
          onChange={(e) => setQuoteClient(job.id, e.target.value)}
          className="h-8 border-white/10 bg-white/[0.03] text-[12px]"
        />
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Line items
          </label>
          <Button
            variant="ghost"
            size="sm"
            data-testid="quote-add-item"
            className="h-6 gap-1 px-2 text-[10px] text-blue-400 hover:text-blue-300"
            onClick={() => addQuoteLineItem(job.id)}
          >
            <Plus className="h-3 w-3" />
            Add item
          </Button>
        </div>

        {(!quote.lineItems || quote.lineItems.length === 0) && (
          <p className="mt-1.5 rounded-md border border-dashed border-white/10 px-2.5 py-3 text-center text-[11px] text-muted-foreground">
            No line items — a quote cannot be sent without at least one.
          </p>
        )}

        {quote.lineItems && quote.lineItems.length > 0 && (
          <ul className="mt-1.5 space-y-1">
            {quote.lineItems.map((item) => (
              <li
                key={item.id}
                className="flex items-baseline justify-between gap-2 rounded-md bg-white/[0.02] px-2 py-1"
              >
                <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-300">
                  {item.description}
                </span>
                <span className="tnum shrink-0 text-[10px] text-muted-foreground">
                  {item.qty} × {formatMoney(item.unitPrice)}
                </span>
                <span className="tnum w-16 shrink-0 text-right text-[11px] font-medium">
                  {formatMoney(item.qty * item.unitPrice)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Separator className="my-2.5 bg-white/[0.07]" />

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">Quote total</span>
        <span data-testid="quote-total" className="tnum text-base font-semibold tracking-tight">
          {formatMoney(quoteTotal(quote.lineItems))}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          size="sm"
          variant="secondary"
          data-testid="quote-mark-sent"
          className="w-full gap-1.5"
          onClick={handleMarkSent}
        >
          <Send className="h-3.5 w-3.5" />
          Mark Sent
        </Button>
        <Button
          size="sm"
          variant="secondary"
          data-testid="quote-mark-approved"
          disabled={quote.status !== 'sent'}
          className="w-full gap-1.5"
          onClick={handleMarkApproved}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Approve
        </Button>
      </div>
    </section>
  )
}
