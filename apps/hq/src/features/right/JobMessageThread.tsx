"use client"

import { useEffect, useState } from "react"
import { MessageSquare } from "lucide-react"

import { authApi } from "@/lib/api"

type Message = { id: string; direction: "dispatch" | "field"; sender: string; body: string; createdAt: string }

/**
 * Job-scoped message thread — the dispatch half of the two-way loop. Lists
 * the job's notes (office ↔ field) and lets the dispatcher post one back.
 * Best-effort: a failed load or post degrades to an empty/disabled state and
 * never blocks the board.
 */
export function JobMessageThread({ jobId }: { jobId: string }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    void authApi
      .listMessages(jobId)
      .then(res => { if (alive) setMessages(res.messages) })
      .catch(() => {})
    return () => { alive = false }
  }, [jobId])

  const send = async () => {
    const body = draft.trim()
    if (!body || busy) return
    setBusy(true)
    try {
      const { message } = await authApi.postMessage(jobId, body, "Dispatch")
      setMessages(prev => [...prev, message])
      setDraft("")
    } catch {
      // Best-effort — dispatch never blocks on the message thread.
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-xl border border-line/80 bg-recess/70 p-3" data-testid="job-messages">
      <label className="label-mono mb-1.5 flex items-center gap-1.5 text-2xs text-ink-low">
        <MessageSquare className="h-3 w-3 text-chrome-400" />JOB MESSAGES · {messages.length}
      </label>
      <div className="max-h-40 space-y-1.5 overflow-y-auto">
        {messages.length === 0 && <p className="text-2xs text-ink-low">No messages yet.</p>}
        {messages.map(m => (
          <div key={m.id} className={`rounded-md border px-2 py-1.5 ${m.direction === "dispatch" ? "border-chrome-600/40 bg-chrome-wash" : "border-line bg-recess"}`}>
            <div className="label-mono flex items-center justify-between text-[10px] text-ink-low">
              <span>{m.sender}</span>
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
