"use client"

import { use, useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import { CircleCheck, CircleSlash } from "lucide-react"

import { apiErrorMessage, authApi, HttpError } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { AuthShell } from "@/features/auth/AuthShell"
import { TextField } from "@/features/setup/primitives"

const ROLE_LABELS: Record<string, string> = {
  technician: "Technician",
  dispatcher: "Dispatcher",
  manager: "Manager",
  accountant: "Accountant",
  admin: "Admin",
  owner: "Owner"
}

/** Public invite acceptance — the link's raw token is the capability. The
 *  peek returns only what this form needs (org name, role, email); accepting
 *  sets a name + password, creates the membership at the invited role and
 *  signs in. Single-use, 7-day expiry, enforced server-side. */
export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "invalid" }
    | { status: "ready"; email: string; name: string | null; role: string; organizationName: string }
  >({ status: "loading" })
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    authApi
      .invite(token)
      .then(invite => {
        if (!alive) return
        if (!invite.valid) {
          setState({ status: "invalid" })
          return
        }
        setState({
          status: "ready",
          email: invite.email,
          name: invite.name,
          role: invite.role,
          organizationName: invite.organizationName
        })
        if (invite.name) setName(invite.name)
      })
      .catch(() => {
        if (alive) setState({ status: "invalid" })
      })
    return () => {
      alive = false
    }
  }, [token])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || !password || password !== confirm) return
    setBusy(true)
    setError(null)
    try {
      await authApi.acceptInvite(token, { name: name.trim() || undefined, password })
      // Signed in by the accept call — a full load re-runs the console gate.
      window.location.assign("/")
    } catch (err) {
      setError(
        err instanceof HttpError && err.status === 409
          ? apiErrorMessage(err, "That email already has an account — sign in instead.")
          : apiErrorMessage(err, "Couldn't accept the invite — ask for a new link.")
      )
      setBusy(false)
    }
  }

  if (state.status === "loading") {
    return (
      <AuthShell title="Checking your invite…">
        <p className="text-xs text-ink-mid">One moment.</p>
      </AuthShell>
    )
  }

  if (state.status === "invalid") {
    return (
      <AuthShell title="That invite link doesn&rsquo;t work">
        <div className="flex flex-col items-start gap-3" data-testid="hq-invite-invalid">
          <CircleSlash className="h-6 w-6 text-urgent" />
          <p className="text-xs leading-relaxed text-ink-mid">
            It&rsquo;s expired, revoked or already used. Ask the person who invited you to send a fresh link.
          </p>
          <Link href="/login" className="text-xs font-semibold text-chrome-600 hover:underline">
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={`Join ${state.organizationName}`}
      subtitle={`You're being added as ${ROLE_LABELS[state.role] ?? state.role} for ${state.email}. Set your password to finish.`}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" data-testid="hq-invite-accept">
        <TextField
          label="Your name"
          autoComplete="name"
          value={name}
          onChange={setName}
          placeholder="Full name"
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
          <p className="text-xs font-semibold text-urgent" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy || !name.trim() || !password || password !== confirm} data-testid="hq-invite-submit">
          {busy ? "JOINING…" : "ACCEPT INVITE"}
        </Button>
      </form>
      {state.role === "technician" && (
        <p className="mt-4 flex items-center gap-1.5 text-ink-mid">
          <CircleCheck className="h-3.5 w-3.5 text-complete" />
          <span className="text-2xs">You&rsquo;ll also use this to sign in to the field app.</span>
        </p>
      )}
    </AuthShell>
  )
}
