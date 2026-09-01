"use client"

import { useState, type FormEvent } from "react"
import { Radio } from "lucide-react"

import { authApi, HttpError, NetworkError } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Station sign-in — shown when the API requires a real session (production
 * auth enabled) and the browser has none. The operator types the deployment's
 * `HQ_BOOTSTRAP_TOKEN`; the minted station session lives in an HTTP-only
 * cookie issued by the API, and the secret never touches the web bundle.
 */
export function HqSignIn({ onSignedIn }: { onSignedIn: () => void }) {
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
      if (err instanceof HttpError) setError("Access denied — check the station token.")
      else if (err instanceof NetworkError) setError("The API is unreachable. Try again when it is online.")
      else setError("Sign-in failed. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <form onSubmit={submit} className="panel w-full max-w-sm rounded-xl p-8" data-testid="hq-signin">
        <div className="flex items-center gap-2.5">
          <div className="btn-primary flex h-9 w-9 items-center justify-center rounded-md text-xs font-black text-on-accent">
            PT
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight">PlumbTrack</div>
            <div className="label-mono text-2xs text-ink-low">HQ CONSOLE</div>
          </div>
        </div>
        <h1 className="mt-6 text-base font-bold">Sign in to the command centre</h1>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-mid">
          Enter the station access token configured for this deployment{" "}
          <span className="label-mono text-2xs">HQ_BOOTSTRAP_TOKEN</span>.
        </p>
        <label className="mt-5 block">
          <span className="label-mono text-2xs text-ink-low">STATION TOKEN</span>
          <Input
            className="mt-1.5 font-mono"
            type="password"
            autoComplete="off"
            value={token}
            onChange={event => setToken(event.target.value)}
            placeholder="••••••••"
            data-testid="hq-signin-token"
          />
        </label>
        {error && (
          <p className="mt-3 text-xs font-semibold text-urgent" role="alert" data-testid="hq-signin-error">
            {error}
          </p>
        )}
        <Button
          type="submit"
          disabled={busy || !token.trim()}
          className="mt-5 w-full"
          data-testid="hq-signin-submit"
        >
          {busy ? "SIGNING IN…" : "SIGN IN"}
        </Button>
        <div className="mt-5 flex items-center gap-1.5 border-t border-line pt-4">
          <Radio className="h-3.5 w-3.5 text-chrome-400" />
          <span className="label-mono text-2xs text-ink-low">SESSION ISSUED BY THE API · 12 HOURS</span>
        </div>
      </form>
    </div>
  )
}
