"use client"

import { Suspense, useState, type FormEvent } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { KeyRound } from "lucide-react"

import { apiErrorMessage, authApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { AuthShell } from "@/features/auth/AuthShell"
import { TextField } from "@/features/setup/primitives"

function ResetForm() {
  const params = useSearchParams()
  const token = params.get("token") ?? ""
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || !password || password !== confirm) return
    setBusy(true)
    setError(null)
    try {
      await authApi.resetPassword(token, password)
      setDone(true)
    } catch (err) {
      setError(apiErrorMessage(err, "That reset link didn't work — request a new one."))
    } finally {
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <p className="text-xs leading-relaxed text-ink-mid" role="alert">
        This link is missing its token — use the full link from the reset email, or{" "}
        <Link href="/forgot-password" className="font-semibold text-chrome-600 hover:underline">
          request a new one
        </Link>
        .
      </p>
    )
  }

  if (done) {
    return (
      <div className="flex flex-col items-start gap-3" data-testid="hq-reset-done">
        <KeyRound className="h-6 w-6 text-complete" />
        <p className="text-sm font-semibold text-ink">Password updated</p>
        <p className="text-xs leading-relaxed text-ink-mid">
          Your new password is set.{" "}
          <Link href="/login" className="font-semibold text-chrome-600 hover:underline">
            Sign in with it
          </Link>
          .
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" data-testid="hq-reset">
      <TextField
        label="New password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        hint="At least 12 characters — a short passphrase works well."
      />
      <TextField
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={setConfirm}
        error={confirm.length > 0 && confirm !== password ? "Passwords don't match." : null}
      />
      {error && (
        <p className="text-xs font-semibold text-urgent" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy || !password || password !== confirm} data-testid="hq-reset-submit">
        {busy ? "UPDATING…" : "SET NEW PASSWORD"}
      </Button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Choose a new password"
      subtitle="The link you opened works once and expires after an hour."
      footer={
        <Link href="/login" className="font-semibold text-chrome-600 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <Suspense fallback={null}>
        <ResetForm />
      </Suspense>
    </AuthShell>
  )
}
