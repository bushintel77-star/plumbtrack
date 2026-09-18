"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"

import { apiErrorMessage, authApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { AuthShell } from "@/features/auth/AuthShell"
import { TextField } from "@/features/setup/primitives"

/** Public business sign-up — creates the org, the owner account and the
 *  setup row in one API transaction, signs in, and lands in the guided
 *  setup wizard. No bootstrap token anywhere on this path. */
export default function SignupPage() {
  const [businessName, setBusinessName] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid =
    businessName.trim().length >= 2 &&
    name.trim().length >= 2 &&
    email.trim().length > 3 &&
    password.length > 0 &&
    confirm === password

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || !valid) return
    setBusy(true)
    setError(null)
    try {
      await authApi.signUp({
        businessName: businessName.trim(),
        name: name.trim(),
        email: email.trim(),
        password
      })
      // New owner → straight into the guided setup wizard.
      window.location.assign("/?module=setup")
    } catch (err) {
      setError(apiErrorMessage(err, "Sign-up failed. Try again."))
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Create your Crewline account"
      subtitle="Set up your business — you'll be the owner, and guided setup walks you through the rest."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-chrome-600 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" data-testid="hq-signup">
        <TextField
          label="Business name"
          autoComplete="organization"
          value={businessName}
          onChange={setBusinessName}
          placeholder="Mallee Plumbing Pty Ltd"
        />
        <TextField
          label="Your name"
          autoComplete="name"
          value={name}
          onChange={setName}
          placeholder="Sam Mallee"
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={setEmail}
          placeholder="you@business.com.au"
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          hint="At least 12 characters — a short passphrase works well."
        />
        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={setConfirm}
          error={confirm.length > 0 && confirm !== password ? "Passwords don't match." : null}
        />
        {error && (
          <p className="text-xs font-semibold text-urgent" role="alert" data-testid="hq-signup-error">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy || !valid} data-testid="hq-signup-submit">
          {busy ? "CREATING…" : "CREATE ACCOUNT"}
        </Button>
      </form>
    </AuthShell>
  )
}
