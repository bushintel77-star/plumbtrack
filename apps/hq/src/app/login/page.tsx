"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { Radio } from "lucide-react"

import { apiErrorMessage, authApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AuthShell } from "@/features/auth/AuthShell"
import { TextField } from "@/features/setup/primitives"

/** Dev/test-only escape hatch: the shared HQ_BOOTSTRAP_TOKEN station sign-in.
 *  Never rendered in production builds — real accounts are the only way in. */
const STATION_TOKEN_ENABLED = process.env.NODE_ENV !== "production"

function StationTokenForm({ onSignedIn }: { onSignedIn: () => void }) {
  const [token, setToken] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!token.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await authApi.hqLogin(token.trim())
      onSignedIn()
    } catch (err) {
      setError(apiErrorMessage(err, "Access denied — check the station token."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 border-t border-line pt-4">
      <label className="block">
        <span className="label-mono text-2xs text-ink-low">STATION TOKEN (DEV)</span>
        <Input
          className="mt-1.5 font-mono"
          type="password"
          autoComplete="off"
          value={token}
          onChange={event => setToken(event.target.value)}
          placeholder="HQ_BOOTSTRAP_TOKEN"
          data-testid="hq-signin-token"
        />
      </label>
      {error && (
        <p className="mt-2 text-xs font-semibold text-urgent" role="alert">
          {error}
        </p>
      )}
      <Button
        type="submit"
        variant="outline"
        disabled={busy || !token.trim()}
        className="mt-3 w-full"
        data-testid="hq-signin-submit"
      >
        {busy ? "SIGNING IN…" : "STATION SIGN-IN"}
      </Button>
    </form>
  )
}

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enter = () => window.location.assign("/")

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || !email.trim() || !password) return
    setBusy(true)
    setError(null)
    try {
      await authApi.login(email.trim(), password)
      enter()
    } catch (err) {
      setError(apiErrorMessage(err, "Sign-in failed. Try again."))
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Your email and password — the ones from sign-up or your invite."
      footer={
        <>
          New to FieldLoop?{" "}
          <Link href="/signup" className="font-semibold text-chrome-600 hover:underline">
            Create a business account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" data-testid="hq-login">
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={setEmail}
          placeholder="you@business.com.au"
        />
        <div>
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            placeholder="Your password"
          />
          <div className="mt-1.5 text-right">
            <Link href="/forgot-password" className="text-xs font-semibold text-chrome-600 hover:underline">
              Forgot password?
            </Link>
          </div>
        </div>
        {error && (
          <p className="text-xs font-semibold text-urgent" role="alert" data-testid="hq-login-error">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy || !email.trim() || !password} data-testid="hq-login-submit">
          {busy ? "SIGNING IN…" : "SIGN IN"}
        </Button>
      </form>
      <div className="mt-4 flex items-center gap-1.5 text-ink-low">
        <Radio className="h-3.5 w-3.5 text-chrome-400" />
        <span className="label-mono text-2xs">SESSION ISSUED BY THE API</span>
      </div>
      {STATION_TOKEN_ENABLED && <StationTokenForm onSignedIn={enter} />}
    </AuthShell>
  )
}
