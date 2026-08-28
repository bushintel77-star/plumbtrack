import { AlertTriangle, FileCheck2, ShieldX } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { daysUntil, formatDate } from '@/lib/format'
import type { ComplianceDoc } from '@/types'

/** Amber within 30 days of expiry, red once expired. */
export function docState(doc: ComplianceDoc): {
  tone: 'expired' | 'warning' | 'ok'
  label: string
} {
  const days = daysUntil(doc.expiresAt)
  if (days < 0) return { tone: 'expired', label: 'EXPIRED' }
  if (days <= 30) return { tone: 'warning', label: `EXPIRES IN ${days}D` }
  return { tone: 'ok', label: `${days}D LEFT` }
}

export function DocumentVault({ documents }: { documents: ComplianceDoc[] }): JSX.Element {
  return (
    <section className="dispatch-surface rounded-xl p-4" data-testid="document-vault">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Document Vault
      </h3>

      {documents.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No compliance documents attached.</p>
      ) : (
        <ul className="mt-2.5 space-y-2">
          {documents.map((doc) => {
            const state = docState(doc)
            return (
              <li
                key={doc.id}
                data-testid={`doc-${doc.id}`}
                className={cn(
                  'flex items-center gap-2.5 rounded-md border bg-white/[0.02] px-2.5 py-2',
                  state.tone === 'expired'
                    ? 'border-destructive/40'
                    : state.tone === 'warning'
                      ? 'border-amber-500/40 bg-amber-500/[0.04]'
                      : 'border-white/[0.07]'
                )}
              >
                {state.tone === 'expired' ? (
                  <ShieldX className="h-4 w-4 shrink-0 text-red-400" />
                ) : state.tone === 'warning' ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                ) : (
                  <FileCheck2 className="h-4 w-4 shrink-0 text-blue-400/80" />
                )}
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-[12px] font-medium">{doc.name}</div>
                  <div className="tnum text-[10px] text-muted-foreground">
                    {doc.ref} · exp {formatDate(doc.expiresAt)}
                  </div>
                </div>
                <Badge
                  data-testid={`doc-badge-${doc.id}`}
                  className={cn(
                    'tnum h-5 shrink-0 rounded-full px-1.5 text-[9px] font-bold',
                    state.tone === 'expired'
                      ? 'bg-destructive/15 text-red-400 hover:bg-destructive/15'
                      : state.tone === 'warning'
                        ? 'animate-pulse-soft bg-amber-500/15 text-amber-400 hover:bg-amber-500/15'
                        : 'bg-white/[0.05] text-muted-foreground hover:bg-white/[0.05]'
                  )}
                >
                  {state.label}
                </Badge>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
