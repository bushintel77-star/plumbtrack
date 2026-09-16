"use client"

import { useState } from "react"
import { Check, Copy, MailCheck } from "lucide-react"

import { apiErrorMessage, authApi, HttpError } from "@/lib/api"
import { ChipChoice, Question, TextField } from "../primitives"
import type { InviteAnswers } from "../types"

const ROLE_OPTIONS = [
  { value: "technician", label: "Technician" },
  { value: "dispatcher", label: "Dispatcher" },
  { value: "manager", label: "Manager" },
  { value: "accountant", label: "Accountant" },
  { value: "admin", label: "Admin" },
  { value: "owner", label: "Owner" }
] as const

/** Real invite send — POST /api/team/invites. When this deployment has an
 *  email provider the invite goes by email; otherwise the API returns the
 *  raw link and the owner shares it themselves. Either way it's a real,
 *  single-use, 7-day invite — nothing simulated. */
export function InviteStep({
  value,
  onChange
}: {
  value: Partial<InviteAnswers>
  onChange: (patch: Partial<InviteAnswers>) => void
}) {
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [role, setRole] = useState<string>("technician")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null)
  const [lastDelivery, setLastDelivery] = useState<"email" | "link" | null>(null)
  const [copied, setCopied] = useState(false)

  const send = async () => {
    if (busy || !email.trim()) return
    setBusy(true)
    setError(null)
    try {
      const result = await authApi.sendInvite({ email: email.trim(), role, name: name.trim() || undefined })
      setLastDelivery(result.delivery)
      setLastInviteUrl(result.inviteUrl ?? null)
      onChange({ invited: (value.invited ?? 0) + 1 })
      setEmail("")
      setName("")
    } catch (err) {
      setError(
        err instanceof HttpError && err.status === 403
          ? "Only an owner or admin can invite people — sign in as one to send this."
          : apiErrorMessage(err, "Couldn't create the invite — try again.")
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Question
        label="Invite a teammate"
        hint="They get a single-use link (7-day expiry) to set their own password and join at the role you pick."
      >
        <div className="panel flex flex-col gap-4 rounded-xl p-4">
          <TextField
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="off"
            value={email}
            onChange={setEmail}
            placeholder="name@business.com.au"
          />
          <TextField
            label="Name"
            value={name}
            onChange={setName}
            placeholder="Optional — they can set it themselves"
          />
          <ChipChoice label="Role" options={ROLE_OPTIONS} value={role} onChange={setRole} />
          {error && (
            <p className="text-xs font-semibold text-urgent" role="alert" data-testid="invite-error">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || !email.trim()}
            className="btn-primary flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-bold text-on-accent disabled:opacity-50"
            data-testid="invite-send"
          >
            {busy ? "SENDING…" : "SEND INVITE"}
          </button>
        </div>
      </Question>

      {lastDelivery === "email" && (
        <div className="panel mt-4 flex items-start gap-3 rounded-xl p-4" data-testid="invite-sent-email">
          <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-complete" />
          <p className="text-xs leading-relaxed text-ink-mid">
            <span className="font-semibold text-ink">Invite sent.</span> An email is on its way with their
            link.
          </p>
        </div>
      )}

      {lastDelivery === "link" && lastInviteUrl && (
        <div className="panel mt-4 rounded-xl p-4" data-testid="invite-sent-link">
          <p className="text-xs font-semibold text-ink">No email provider is configured on this deployment.</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-mid">
            Share this link with them directly — it works once and expires in 7 days.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-recess px-2.5 py-2 font-mono text-2xs text-ink">
              {lastInviteUrl}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(lastInviteUrl).then(() => {
                  setCopied(true)
                  window.setTimeout(() => setCopied(false), 1500)
                })
              }}
              className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-line px-4 text-sm font-semibold text-ink hover:border-chrome-400"
              data-testid="invite-copy"
            >
              {copied ? <Check className="h-4 w-4 text-complete" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {(value.invited ?? 0) > 0 && (
        <p className="mt-4 text-xs text-ink-mid" data-testid="invite-count">
          {value.invited} invite{value.invited === 1 ? "" : "s"} sent this session.
        </p>
      )}
    </>
  )
}
