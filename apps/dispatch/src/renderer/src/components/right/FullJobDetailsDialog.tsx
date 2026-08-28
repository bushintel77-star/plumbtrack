import { useState } from 'react'
import { FileText, History, ReceiptText } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatMoney, formatElapsed, quoteTotal, daysUntil } from '@/lib/format'
import { useDispatchStore } from '@/store/dispatchStore'
import type { Job } from '@/types'

const tabs = [
  { id: 'quote', label: 'Quote builder', icon: ReceiptText },
  { id: 'documents', label: 'Documents & compliance', icon: FileText },
  { id: 'activity', label: 'Activity & audit', icon: History }
] as const

type TabId = (typeof tabs)[number]['id']

export function FullJobDetailsDialog({ job, open, onOpenChange }: { job: Job | undefined; open: boolean; onOpenChange: (open: boolean) => void }): JSX.Element {
  const [tab, setTab] = useState<TabId>('quote')
  const setQuoteClient = useDispatchStore((s) => s.setQuoteClient)
  const addQuoteLineItem = useDispatchStore((s) => s.addQuoteLineItem)
  const markQuoteSent = useDispatchStore((s) => s.markQuoteSent)
  const markQuoteApproved = useDispatchStore((s) => s.markQuoteApproved)

  if (!job) return <Dialog open={false} onOpenChange={onOpenChange} />
  const quote = job.quote

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="full-job-details-dialog" aria-describedby="full-job-details-description" className="max-w-4xl border-white/15 bg-slate-900/90 p-0 text-foreground shadow-2xl backdrop-blur-2xl">
        <DialogHeader className="border-b border-white/10 px-6 pb-4 pt-6 pr-12">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="tnum text-[10px] font-bold uppercase tracking-[0.16em] text-blue-400">{job.id} · {job.status}</p>
              <DialogTitle className="mt-1 text-xl">{job.title}</DialogTitle>
              <DialogDescription id="full-job-details-description" className="mt-1">{job.client} · {job.address}</DialogDescription>
            </div>
            <Badge className="bg-white/10 text-muted-foreground">{job.priority}</Badge>
          </div>
        </DialogHeader>
        <div className="grid min-h-[420px] grid-cols-[220px_1fr]">
          <nav className="border-r border-white/10 p-3" aria-label="Job detail sections">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn('mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs transition-colors', tab === id ? 'bg-primary/15 text-blue-300' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground')}>
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
          </nav>
          <div className="min-w-0 overflow-y-auto p-6">
            {tab === 'quote' && (
              <section className="space-y-4">
                <div><h3 className="text-sm font-semibold">Interactive quote builder</h3><p className="mt-1 text-xs text-muted-foreground">Prepare pricing before releasing it to the customer.</p></div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Client name<input value={quote.clientName ?? ''} onChange={(e) => setQuoteClient(job.id, e.target.value)} className="mt-1 h-9 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm outline-none focus:border-primary" placeholder="Required before sending" /></label>
                <div className="overflow-hidden rounded-lg border border-white/10">
                  <div className="grid grid-cols-[1fr_70px_110px_110px] gap-2 bg-white/5 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><span>Description</span><span>Qty</span><span>Unit price</span><span className="text-right">Total</span></div>
                  {(quote.lineItems ?? []).map((item) => <div key={item.id} className="grid grid-cols-[1fr_70px_110px_110px] gap-2 border-t border-white/10 px-3 py-2 text-xs"><span className="truncate">{item.description}</span><span className="tnum">{item.qty}</span><span className="tnum">{formatMoney(item.unitPrice)}</span><span className="tnum text-right">{formatMoney(item.qty * item.unitPrice)}</span></div>)}
                  {(quote.lineItems ?? []).length === 0 && <p className="px-3 py-8 text-center text-xs text-muted-foreground">No line items yet.</p>}
                </div>
                <div className="flex items-center justify-between"><Button variant="secondary" size="sm" onClick={() => addQuoteLineItem(job.id)}>Add line item</Button><span className="tnum text-lg font-semibold">{formatMoney(quoteTotal(quote.lineItems))}</span></div>
                <div className="flex gap-2"><Button size="sm" onClick={() => markQuoteSent(job.id)}>Mark sent</Button><Button size="sm" variant="secondary" disabled={quote.status !== 'sent'} onClick={() => markQuoteApproved(job.id)}>Approve</Button></div>
              </section>
            )}
            {tab === 'documents' && <section><h3 className="text-sm font-semibold">Document & compliance vault</h3><div className="mt-4 space-y-2">{job.documents.map((doc) => { const days = daysUntil(doc.expiresAt); const expired = days < 0; const warning = days <= 30; return <div key={doc.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-3"><div><p className="text-xs font-medium">{doc.name}</p><p className="tnum mt-1 text-[10px] text-muted-foreground">{doc.ref} · expires {doc.expiresAt}</p></div><Badge variant="outline" className={cn('text-[10px]', expired ? 'border-red-500/40 text-red-300' : warning ? 'border-amber-500/40 text-amber-300' : 'text-blue-200')}>{expired ? 'Expired' : warning ? `${days}d left` : 'Valid'}</Badge></div> })}</div></section>}
            {tab === 'activity' && <section><h3 className="text-sm font-semibold">Activity & audit trail</h3><div className="mt-4 space-y-3 border-l border-white/15 pl-4 text-xs"><div><p className="font-medium">Dispatch record created</p><p className="tnum mt-1 text-[10px] text-muted-foreground">Job {job.id} entered the planning board</p></div><div><p className="font-medium">Timer history</p><p className="tnum mt-1 text-[10px] text-muted-foreground">{formatElapsed(job.elapsedSeconds)} · {job.clockOnCount} clock-on event{job.clockOnCount === 1 ? '' : 's'}</p></div><div><p className="font-medium">Current assignment</p><p className="mt-1 text-[10px] text-muted-foreground">{job.techId ? `Technician ${job.techId}` : 'Unassigned queue'}</p></div></div></section>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
