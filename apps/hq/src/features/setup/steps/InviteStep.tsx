"use client"

import { useState } from "react"
import { Check, Copy, QrCode } from "lucide-react"

import { Question, Stepper } from "../primitives"
import type { InviteAnswers } from "../types"

/** The share link/QR code the setup spec calls for — no typing required to
 *  invite the team. Real invites are Team admin's job; here we just count
 *  intent so the review step can say "N invites planned". */
export function InviteStep({
  value,
  onChange
}: {
  value: Partial<InviteAnswers>
  onChange: (patch: Partial<InviteAnswers>) => void
}) {
  const [copied, setCopied] = useState(false)
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/join` : "https://app.fieldloop.com.au/join"

  return (
    <>
      <Question
        label="Invite your team"
        hint="Anyone who opens this link can request to join — you approve them in Team admin before they can see anything."
      >
        <div className="panel flex flex-wrap items-center gap-4 rounded-xl p-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-line bg-recess text-ink-low">
            <QrCode className="h-10 w-10" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">Scan or share this link</p>
            <p className="mt-0.5 truncate font-mono text-xs text-ink-mid">{shareUrl}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(shareUrl).then(() => {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1500)
              })
            }}
            className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-4 text-sm font-semibold text-ink hover:border-chrome-400"
          >
            {copied ? <Check className="h-4 w-4 text-complete" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </Question>

      <Question label="Roughly how many people will you invite?" optional hint="Just for planning — it doesn't send anything.">
        <Stepper label="People to invite" value={value.invited ?? 0} onChange={next => onChange({ invited: next })} min={0} max={200} />
      </Question>
    </>
  )
}
