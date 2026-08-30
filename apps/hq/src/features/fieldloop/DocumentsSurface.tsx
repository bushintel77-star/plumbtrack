"use client"

import { useMemo, useState } from "react"
import { FileText, Download } from "lucide-react"

import { orgDocuments } from "@/data/seed"
import { formatDate } from "@/lib/format"
import { documentVerdict } from "@/lib/fieldloop"
import { cn } from "@/lib/utils"
import { useJobsList } from "@/stores/boardStore"
import { DOC_CATEGORIES, type ComplianceDoc, type DocCategory } from "@/types"

import { ExpiryChip, HonestAction } from "./common"

function useDocuments(): ComplianceDoc[] {
  const jobs = useJobsList()
  return useMemo(() => {
    const fromJobs = jobs.flatMap(job =>
      job.documents.map(doc => ({
        ...doc,
        category: doc.category ?? ("Job Records" as DocCategory),
        owner: doc.owner ?? job.client,
        linkedJobId: doc.linkedJobId ?? job.id
      }))
    )
    return [...orgDocuments, ...fromJobs]
  }, [jobs])
}

export function DocumentsSurface() {
  const documents = useDocuments()
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
        {inCategory.length === 0 && <div className="fl-muted">No documents in this category.</div>}
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
            <HonestAction requirement="S3-compatible file storage" icon={<Download size={13} />}>
              Download original
            </HonestAction>
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
