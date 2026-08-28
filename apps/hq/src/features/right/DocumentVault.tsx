"use client"

import { AlertTriangle, ExternalLink, FileCheck2, ShieldX } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { daysUntil, formatDate } from "@/lib/format"
import type { ComplianceDoc } from "@/types"

/** Amber within 30 days of expiry, red once expired (BR-03). */
export function docState(doc: ComplianceDoc): {
  tone: "expired" | "warning" | "ok"
  label: string
} {
  const days = daysUntil(doc.expiresAt)
  if (days < 0) return { tone: "expired", label: "EXPIRED" }
  if (days <= 30) return { tone: "warning", label: `EXPIRES IN ${days}D` }
  return { tone: "ok", label: `${days}D LEFT` }
}

export function DocumentVault({ documents }: { documents: ComplianceDoc[] }) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/5 p-3" data-testid="document-vault">
      <h3 className="label-mono text-2xs text-ink-low">DOCUMENT VAULT</h3>

      {documents.length === 0 ? (
        <p className="mt-2 text-xs text-ink-low">No compliance documents attached.</p>
      ) : (
        <ul className="mt-2.5 space-y-2">
          {documents.map(doc => {
            const state = docState(doc)
            return (
              <li
                key={doc.id}
                data-testid={`doc-${doc.id}`}
                className={cn(
                  "flex items-center gap-2.5 rounded-md border bg-recess px-2.5 py-2",
                  state.tone === "expired"
                    ? "border-urgent"
                    : state.tone === "warning"
                      ? "border-pending"
                      : "border-line"
                )}
              >
                {state.tone === "expired" ? (
                  <ShieldX className="h-4 w-4 shrink-0 text-urgent" />
                ) : state.tone === "warning" ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-pending" />
                ) : (
                  <FileCheck2 className="h-4 w-4 shrink-0 text-chrome-400" />
                )}
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-xs font-semibold">{doc.name}</div>
                  <div className="label-mono tnum truncate text-2xs text-ink-low">
                    {doc.ref} · EXP {formatDate(doc.expiresAt)}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Open ${doc.name}`}
                  className="rounded p-1 text-ink-low transition-colors hover:bg-fill hover:text-chrome-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chrome-400"
                  title="Open document"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
                <Badge
                  data-testid={`doc-badge-${doc.id}`}
                  className={cn(
                    "label-mono tnum h-5 shrink-0 rounded-full px-2 text-2xs font-bold",
                    state.tone === "expired"
                      ? "bg-urgent-wash text-urgent hover:bg-urgent-wash"
                      : state.tone === "warning"
                        ? "animate-pulse-soft bg-pending-wash text-pending hover:bg-pending-wash"
                        : "bg-chrome-wash text-chrome-400 hover:bg-chrome-wash"
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
