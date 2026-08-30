"use client"

import { useEffect, useMemo, useState } from "react"
import { Search } from "lucide-react"

import { blockLabel } from "@/lib/format"
import { initialsOf } from "@/lib/fieldloop"
import { cn } from "@/lib/utils"
import { useBoardStore, useJobsList } from "@/stores/boardStore"

export interface PaletteHit {
  id: string
  kind: "job" | "technician"
  label: string
  detail: string
}

/**
 * Subsequence match: every character of the query must appear in order. Cheap,
 * predictable, and forgiving of the abbreviations dispatchers actually type
 * ("nmall" finds "Northgate Mall").
 */
export function fuzzyMatch(query: string, candidate: string): boolean {
  const needle = query.toLowerCase().replace(/\s+/g, "")
  if (needle === "") return true
  const hay = candidate.toLowerCase()
  let cursor = 0
  for (const char of needle) {
    cursor = hay.indexOf(char, cursor)
    if (cursor === -1) return false
    cursor += 1
  }
  return true
}

export function Palette({
  open,
  onClose,
  onPickJob,
  onPickTechnician
}: {
  open: boolean
  onClose: () => void
  onPickJob: (jobId: string) => void
  onPickTechnician: (techId: string) => void
}) {
  const jobs = useJobsList()
  const technicians = useBoardStore(s => s.technicians)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)

  const hits = useMemo<PaletteHit[]>(() => {
    const jobHits: PaletteHit[] = jobs
      .filter(job => fuzzyMatch(query, `${job.title} ${job.client} ${job.address}`))
      .map(job => ({
        id: job.id,
        kind: "job",
        label: job.title,
        detail: `${job.client} · ${blockLabel(job.startBlock)}`
      }))
    const techHits: PaletteHit[] = technicians
      .filter(tech => fuzzyMatch(query, `${tech.name} ${tech.van} ${tech.role}`))
      .map(tech => ({
        id: tech.id,
        kind: "technician",
        label: tech.name,
        detail: `${tech.role} · ${tech.van}`
      }))
    return [...jobHits, ...techHits].slice(0, 40)
  }, [jobs, technicians, query])

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  if (!open) return null

  const pick = (hit: PaletteHit | undefined) => {
    if (!hit) return
    if (hit.kind === "job") onPickJob(hit.id)
    else onPickTechnician(hit.id)
    onClose()
  }

  return (
    <div
      className="fl-palette-scrim"
      role="presentation"
      onClick={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="fl-palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <label>
          <Search size={16} />
          <input
            autoFocus
            value={query}
            placeholder="Search jobs and crew…"
            aria-label="Search jobs and crew"
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Escape") onClose()
              if (event.key === "ArrowDown") {
                event.preventDefault()
                setActive(index => Math.min(index + 1, hits.length - 1))
              }
              if (event.key === "ArrowUp") {
                event.preventDefault()
                setActive(index => Math.max(index - 1, 0))
              }
              if (event.key === "Enter") pick(hits[active])
            }}
          />
        </label>
        <div className="fl-palette-list">
          {hits.length === 0 && <div className="fl-muted">Nothing matches “{query}”.</div>}
          {hits.map((hit, index) => (
            <button
              type="button"
              key={`${hit.kind}:${hit.id}`}
              className={cn("fl-palette-row", index === active && "active")}
              onMouseEnter={() => setActive(index)}
              onClick={() => pick(hit)}
            >
              <span className="fl-avatar small">{initialsOf(hit.label)}</span>
              {hit.label}
              <small>{hit.detail}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
