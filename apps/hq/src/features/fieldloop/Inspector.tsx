"use client"

import { useState, type ReactNode } from "react"
import { AlertTriangle, ChevronLeft, Clock3, MapPin, Phone, RotateCw, X } from "lucide-react"

import { performAssignment } from "@/features/board/actions"
import { TOTAL_BLOCKS, blockLabel } from "@/lib/format"
import { dispatchStatus } from "@/lib/fieldloop"
import type { AttentionFlag } from "@/types"
import { cn } from "@/lib/utils"
import { useBoardStore } from "@/stores/boardStore"
import type { Job } from "@/types"

import { Avatar, StatusChip } from "./common"
import { useFailedOps } from "./failedOps"

/**
 * The single active inspector. One panel is visible at a time: a selected
 * record when the dispatcher has picked one, otherwise the surface's
 * proactive pane — the work that needs a decision before anyone asks.
 */
export function Inspector({
  job,
  onClear,
  title,
  children
}: {
  job?: Job
  onClear?: () => void
  /** Heading for the proactive pane shown when nothing is selected. */
  title: string
  children?: ReactNode
}) {
  const technicians = useBoardStore(s => s.technicians)

  if (!job) {
    return (
      <aside className="fl-panel fl-inspector" aria-label={title}>
        <div className="fl-kicker">{title}</div>
        {children}
      </aside>
    )
  }

  const tech = technicians.find(item => item.id === job.techId)
  return (
    <aside className="fl-panel fl-inspector" aria-label={job.title}>
      <button type="button" className="fl-back" onClick={onClear}>
        <ChevronLeft size={12} />
        {title}
      </button>
      <StatusChip status={dispatchStatus(job)} />
      <h2>{job.title}</h2>
      <p>
        <MapPin size={14} />
        {job.address}
      </p>
      <p>
        <Clock3 size={14} />
        {job.techId
          ? `${blockLabel(job.startBlock)} – ${blockLabel(job.startBlock + job.spanBlocks)}`
          : "Not scheduled to a crew yet"}
      </p>
      <p>
        {job.client}
        <a href={`tel:${job.client.replace(/\s+/g, "")}`}>
          <Phone size={12} />
          Call
        </a>
      </p>
      {tech ? (
        <div className="fl-assignee">
          <Avatar name={tech.name} />
          <div>
            <strong>{tech.name}</strong>
            <span>
              {tech.role} · {tech.van}
            </span>
          </div>
        </div>
      ) : (
        <div className="fl-assignee">This job has no crew yet.</div>
      )}
      <AssignControl job={job} />
    </aside>
  )
}

/**
 * Keyboard route to the same mutation as dragging. Drag-and-drop is the fast
 * path, not the only path: a dispatcher on a keyboard or screen reader has to
 * be able to place a job too.
 */
function AssignControl({ job }: { job: Job }) {
  const technicians = useBoardStore(s => s.technicians)
  const [techId, setTechId] = useState(job.techId ?? "")
  const [startBlock, setStartBlock] = useState(job.startBlock)

  return (
    <div className="fl-assign">
      <div className="fl-kicker">Assign</div>
      <label className="fl-input">
        <span className="sr-only">Crew</span>
        <select value={techId} onChange={event => setTechId(event.target.value)} aria-label="Crew">
          <option value="">Choose crew…</option>
          {technicians.map(tech => (
            <option key={tech.id} value={tech.id}>
              {tech.name} · {tech.van}
            </option>
          ))}
        </select>
      </label>
      <label className="fl-input">
        <span className="sr-only">Start time</span>
        <select
          value={startBlock}
          onChange={event => setStartBlock(Number(event.target.value))}
          aria-label="Start time"
        >
          {Array.from({ length: TOTAL_BLOCKS }, (_, index) => (
            <option key={index} value={index}>
              {blockLabel(index)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="fl-assign-go"
        disabled={!techId}
        onClick={() => {
          void performAssignment(job.id, techId, startBlock)
        }}
      >
        Place on board
      </button>
    </div>
  )
}

/** Proactive dispatch pane: the computed Needs Attention list, worst first. */
export function AttentionPane({
  flags,
  onSelect
}: {
  flags: AttentionFlag[]
  onSelect: (jobId: string) => void
}) {
  if (flags.length === 0) {
    return <div className="fl-muted">Nothing needs attention on this day.</div>
  }
  return (
    <>
      {flags.map(flag => (
        <button
          type="button"
          key={flag.id}
          className={cn("fl-flag", flag.severity)}
          onClick={() => onSelect(flag.jobId)}
        >
          <AlertTriangle size={14} />
          <div>
            <strong>{flag.title}</strong>
            <span>{flag.detail}</span>
          </div>
        </button>
      ))}
    </>
  )
}

/**
 * Connection and sync pane. Retry replays the move through the same
 * validation that rejected it, so a genuine business-rule rejection fails
 * again rather than appearing to succeed on a second try.
 */
export function SyncPane({
  onRetry
}: {
  onRetry: (jobId: string, techId: string, startBlock: number) => Promise<boolean>
}) {
  const ops = useFailedOps(s => s.ops)
  const discard = useFailedOps(s => s.discard)

  if (ops.length === 0) {
    return <div className="fl-muted">No failed operations. Every move has been accepted.</div>
  }
  return (
    <>
      {ops.map(op => (
        <div className="fl-op" key={op.id} data-testid={`fl-op-${op.jobId}`}>
          <strong>{op.jobTitle}</strong>
          <span>
            {op.techName} · {blockLabel(op.startBlock)}
          </span>
          <p>{op.reason}</p>
          <div className="fl-op-actions">
            <button
              type="button"
              onClick={() => {
                void onRetry(op.jobId, op.techId, op.startBlock).then(ok => {
                  if (ok) discard(op.id)
                })
              }}
            >
              <RotateCw size={12} />
              Retry
            </button>
            <button type="button" onClick={() => discard(op.id)}>
              <X size={12} />
              Discard
            </button>
          </div>
        </div>
      ))}
    </>
  )
}
