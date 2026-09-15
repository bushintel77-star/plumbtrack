"use client"

import { useEffect, useState } from "react"
import { Hash, MessageSquare } from "lucide-react"

import { authApi, type JobMessageBridge, type JobMessageRecord } from "@/lib/api"

/** Slack replies and technician posts arrive without a board refresh. */
const REFRESH_MS = 15_000

function bridgeLine(slack: JobMessageBridge | null): string | null {
  if (!slack?.connected) return null
  return slack.linked
    ? "MIRRORED TO THIS JOB'S SLACK THREAD — REPLIES THERE LAND HERE"
    : "SLACK CONNECTED — ROUTE JOB MESSAGES IN SLACK → AUTOMATION ROUTING TO MIRROR THIS THREAD"
}

/**
 * Job-scoped message thread — the dispatch half of the two-way loop. Lists
 * the job's notes (office ↔ field, plus replies bridged in from the job's
 * Slack thread) and lets the dispatcher post one back. Best-effort: a failed
 * load or post degrades to an empty/disabled state and never blocks the board.
 */
export function JobMessageThread({ jobId }: { jobId: string }) {
  const [messages, setMessages] = useState<JobMessageRecord[]>([])
  const [slack, setSlack] = useState<JobMessageBridge | null>(null)
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    const load = () =>
      authApi
        .listMessages(jobId)
        .then(res => {
          if (!alive) return
          setMessages(res.messages)
          setSlack(res.slack ?? null)
        })
        .catch(() => {})
    void load()
    const timer = setInterval(() => { void load() }, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [jobId])

  const send = async () => {
    const body = draft.trim()
    if (!body || busy) return
    setBusy(true)
    try {
      const { message } = await authApi.postMessage(jobId, body, "Dispatch")
      setMessages(prev => (prev.some(existing => existing.id === message.id) ? prev : [...prev, message]))
      setDraft("")
    } catch {
      // Best-effort — dispatch never blocks on the message thread.
    } finally {
      setBusy(false)
    }
  }

  const bridge = bridgeLine(slack)

  return (
    <section className="rounded-xl border border-line/80 bg-recess/70 p-3" data-testid="job-messages">
      <label className="label-mono mb-1.5 flex items-center gap-1.5 text-2xs text-ink-low">
        <MessageSquare className="h-3 w-3 text-chrome-400" />JOB MESSAGES · {messages.length}
      </label>
      {bridge && (
        <p className="label-mono mb-1.5 flex items-center gap-1 text-[10px] text-ink-low" data-testid="job-messages-slack">
          <Hash className="h-3 w-3 shrink-0 text-chrome-400" aria-hidden="true" />
          {bridge}
        </p>
      )}
      <div className="max-h-40 space-y-1.5 overflow-y-auto">
        {messages.length === 0 && <p className="text-2xs text-ink-low">No messages yet.</p>}
        {messages.map(m => (
          <div key={m.id} className={`rounded-md border px-2 py-1.5 ${m.direction === "dispatch" ? "border-chrome-600/40 bg-chrome-wash" : "border-line bg-recess"}`}>
            <div className="label-mono flex items-center justify-between text-[10px] text-ink-low">
              <span className="flex items-center gap-1">
                {m.sender}
                {m.source === "slack" && (
                  <span className="flex items-center gap-0.5 text-chrome-400">
                    <Hash className="h-2.5 w-2.5" aria-hidden="true" />VIA SLACK
                  </span>
                )}
              </span>
              <span className="tnum">{new Date(m.createdAt).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <p className="mt-0.5 text-xs text-ink">{m.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") void send() }}
          placeholder="Message the technician…"
          aria-label="Job message"
          className="min-w-0 flex-1 rounded-md border border-line bg-recess px-2 py-1.5 text-xs text-ink outline-none focus:border-chrome-400"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || !draft.trim()}
          className="rounded-md bg-chrome-600 px-2.5 py-1.5 text-xs font-semibold text-on-accent hover:bg-chrome-400 disabled:opacity-50"
        >
          SEND
        </button>
      </div>
    </section>
  )
}
