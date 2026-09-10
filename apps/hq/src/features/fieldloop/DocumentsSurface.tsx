"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { FileText, Download } from "lucide-react"

import { apiGet } from "@/lib/api"
import { formatDate } from "@/lib/format"
import { documentVerdict } from "@/lib/fieldloop"
import { cn } from "@/lib/utils"
import { DOC_CATEGORIES, type ComplianceDoc, type DocCategory } from "@/types"

import { ExpiryChip, HonestAction } from "./common"

/** Live document register from /api/documents — the API's JobDocument model
 *  (name, category, expiresOn, version history). Files themselves live in the
 *  media vault; a version with a recorded url downloads for real. */
interface ApiDocument {
  id: string
  jobId?: string | null
  name: string
  category: string
  expiresOn?: string | null
  notes?: string | null
  currentVersion?: { fileName?: string; url?: string | null; uploadedAt?: string; uploadedBy?: string } | null
  versions?: Array<{ fileName?: string; url?: string | null; uploadedAt?: string; uploadedBy?: string }>
}

const CATEGORY_FALLBACK: DocCategory = "Job Records"

function toComplianceDoc(apiDoc: ApiDocument): ComplianceDoc {
  const latest = apiDoc.currentVersion ?? apiDoc.versions?.[0] ?? null
  const category = (DOC_CATEGORIES as readonly string[]).includes(apiDoc.category)
    ? (apiDoc.category as DocCategory)
    : CATEGORY_FALLBACK
  return {
    id: apiDoc.id,
    name: apiDoc.name,
    ref: apiDoc.id.slice(-6).toUpperCase(),
    category,
    docType: apiDoc.category,
    entityType: apiDoc.jobId ? undefined : "company",
    owner: latest?.uploadedBy ?? "Company",
    issuedAt: latest?.uploadedAt ?? undefined,
    expiresAt: apiDoc.expiresOn ?? null,
    fileUrl: latest?.url ?? undefined,
    linkedJobId: apiDoc.jobId ?? undefined
  }
}

function useDocuments(): { documents: ComplianceDoc[]; loading: boolean; error: unknown } {
  const documentsQuery = useQuery({
    queryKey: ["documents-surface"],
    queryFn: () => apiGet<ApiDocument[]>("/api/documents"),
    refetchInterval: 30000
  })
  const documents = useMemo(
    () => (documentsQuery.data ?? []).map(toComplianceDoc),
    [documentsQuery.data]
  )
  return { documents, loading: documentsQuery.isLoading, error: documentsQuery.error }
}

export function DocumentsSurface() {
  const { documents, loading, error } = useDocuments()
  const [category, setCategory] = useState<DocCategory>("Compliance & Licenses")
  const [selectedId, setSelectedId] = useState("")

  const inCategory = documents.filter(doc => doc.category === category)
  const selected = documents.find(doc => doc.id === selectedId)
  const alarms = documents
    .map(doc => ({ doc, verdict: documentVerdict(doc) }))
    .filter(entry => entry.verdict.state === "expired" || entry.verdict.state === "expiring")
    .sort((a, b) => (a.verdict.days ?? 0) - (b.verdict.days ?? 0))

  return (
    <>
      <aside className="fl-panel fl-tree" aria-label="Document categories">
        <div className="fl-kicker">Categories</div>
        {loading && <div className="fl-muted">Loading live documents…</div>}
        {error ? <div className="fl-muted">API unavailable — no live document register.</div> : null}
        {DOC_CATEGORIES.map(item => (
          <button
            type="button"
            key={item}
            aria-pressed={category === item}
            className={cn("fl-category", category === item && "selected")}
            onClick={() => setCategory(item)}
          >
            {item}
            <b>{documents.filter(doc => doc.category === item).length}</b>
          </button>
        ))}
      </aside>
      <main className="fl-canvas">
        <div className="fl-canvas-toolbar">
          <div>
            <strong className={cn("fl-count", alarms.length > 0 ? "amber" : "green")}>
              {alarms.length}
            </strong>
            <b>expiring or expired</b>
          </div>
        </div>
        {!loading && inCategory.length === 0 && <div className="fl-muted">No documents in this category.</div>}
        {inCategory.map(doc => {
          const verdict = documentVerdict(doc)
          return (
            <button
              type="button"
              key={doc.id}
              className="fl-doc"
              onClick={() => setSelectedId(doc.id)}
            >
              <FileText size={16} />
              <div>
                <strong>{doc.name}</strong>
                <span>
                  {doc.owner ?? "Company"} · {doc.ref}
                  {doc.expiresAt ? ` · expires ${formatDate(doc.expiresAt)}` : ""}
                </span>
              </div>
              <ExpiryChip state={verdict.state} label={verdict.label} />
            </button>
          )
        })}
      </main>
      <aside className="fl-panel fl-inspector" aria-label="Expiring and expired">
        {selected ? (
          <>
            <button type="button" className="fl-back" onClick={() => setSelectedId("")}>
              Expiring &amp; expired
            </button>
            <h2>{selected.name}</h2>
            <p>{selected.owner ?? "Company"}</p>
            <p>{selected.ref}</p>
            <p>
              {selected.expiresAt
                ? `Expires ${formatDate(selected.expiresAt)}`
                : "No expiry — kept on record"}
            </p>
            {selected.fileUrl ? (
              <a className="fl-download" href={selected.fileUrl} target="_blank" rel="noreferrer">
                <Download size={13} /> Download original
              </a>
            ) : (
              <HonestAction requirement="a file uploaded through the media vault" icon={<Download size={13} />}>
                Download original
              </HonestAction>
            )}
          </>
        ) : (
          <>
            <div className="fl-kicker">Expiring &amp; expired</div>
            {alarms.length === 0 && <div className="fl-muted">Every document is current.</div>}
            {alarms.map(({ doc, verdict }) => (
              <button
                type="button"
                key={doc.id}
                className={cn("fl-flag", verdict.state === "expired" ? "red" : "amber")}
                onClick={() => {
                  if (doc.category) setCategory(doc.category)
                  setSelectedId(doc.id)
                }}
              >
                <FileText size={14} />
                <div>
                  <strong>{doc.name}</strong>
                  <span>
                    {doc.owner ?? "Company"} · {verdict.label}
                  </span>
                </div>
              </button>
            ))}
          </>
        )}
      </aside>
    </>
  )
}
