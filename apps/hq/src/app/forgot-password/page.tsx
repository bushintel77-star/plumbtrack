"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { MailCheck } from "lucide-react"

import { apiErrorMessage, authApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { AuthShell } from "@/features/auth/AuthShell"
import { TextField } from "@/features/setup/primitives"

/** Request a password-reset link. The API answers identically whether or
 *  not the email exists; `delivery` only reports whether this deployment can
 *  actually send email — surfaced honestly, never a fake "check your inbox". */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<"email" | "unconfigured" | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || !email.trim()) return
    setBusy(true)
    setError(null)
    try {
      const response = await authApi.forgotPassword(email.trim())
      setResult(response.delivery)
    } catch (err) {
      setError(apiErrorMessage(err, "Something went wrong — try again."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email on your account. If it's registered, we'll send a one-hour reset link."
      footer={
        <Link href="/login" className="font-semibold text-chrome-600 hover:underline">
          Back to sign in
        </Link>
      }
    >
      {result === "email" ? (
        <div className="flex flex-col items-start gap-3" data-testid="hq-forgot-sent">
          <MailCheck className="h-6 w-6 text-complete" />
          <p className="text-sm font-semibold text-ink">Check your email</p>
          <p className="text-xs leading-relaxed text-ink-mid">
            If that address has an account, a reset link is on its way. It works once and expires in an hour.
          </p>
        </div>
      ) : result === "unconfigured" ? (
        <div className="flex flex-col items-start gap-3" data-testid="hq-forgot-unconfigured">
          <MailCheck className="h-6 w-6 text-ink-low" />
          <p className="text-sm font-semibold text-ink">No email provider is configured</p>
          <p className="text-xs leading-relaxed text-ink-mid">
            This deployment can&rsquo;t send email yet, so no reset link was delivered. Ask your administrator to
            reset the password manually — the request has been logged for them.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4" data-testid="hq-forgot">
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={setEmail}
            placeholder="you@business.com.au"
          />
          {error && (
            <p className="text-xs font-semibold text-urgent" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy || !email.trim()} data-testid="hq-forgot-submit">
            {busy ? "SENDING…" : "SEND RESET LINK"}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
