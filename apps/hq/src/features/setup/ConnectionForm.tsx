"use client"

import { useState } from "react"
import { Check, ChevronRight, ExternalLink, Loader2, ShieldCheck } from "lucide-react"

import { TextField } from "./primitives"
import { integrationsApi, readableError, type IntegrationCard } from "./api"
import { cn } from "@/lib/utils"

/**
 * The step-by-step connect experience for one provider — chosen over a
 * modal so the numbered instructions and the input sit side by side, the
 * same "never leave the screen" rule as the rest of the wizard.
 *
 * OAuth 2.0 + PKCE: clicking Connect asks the API for a ready-made authorize
 * URL and follows it immediately — the code verifier never exists in this
 * component, only on the server (apps/api/src/lib/pkce.ts).
 */
export function ConnectionForm({
  provider,
  onConnected,
  onClose
}: {
  provider: IntegrationCard
  onConnected: (accountLabel: string | null) => void
  onClose: () => void
}) {
  const [fields, setFields] = useState<Record<string, string>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const setField = (id: string, value: string) => {
    setFields(current => ({ ...current, [id]: value }))
    setTestResult(null)
    setFormError(null)
    setFieldErrors(current => {
      if (!current[id]) return current
      const next = { ...current }
      delete next[id]
      return next
    })
  }

  const runTest = async () => {
    setTesting(true)
    setFormError(null)
    try {
      const result = await integrationsApi.test(provider.id, fields)
      setTestResult({ ok: true, message: result.accountLabel ? `Connected to ${result.accountLabel}.` : "That looks right." })
    } catch (error) {
      setTestResult(null)
      setFormError(readableError(error, "That didn't work — check the details and try again."))
    } finally {
      setTesting(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setFormError(null)
    try {
      const result = await integrationsApi.saveKey(provider.id, fields)
      onConnected(result.accountLabel)
    } catch (error) {
      setFormError(readableError(error, "Couldn't save that — check the details and try again."))
    } finally {
      setSaving(false)
    }
  }

  const connectOAuth = async () => {
    setConnecting(true)
    setFormError(null)
    try {
      const returnTo = `${window.location.pathname}?module=setup`
      const { url } = await integrationsApi.oauthStart(provider.id, returnTo)
      window.location.href = url
    } catch (error) {
      setFormError(readableError(error, `Couldn't start connecting to ${provider.name}.`))
      setConnecting(false)
    }
  }

  const requiredFilled = (provider.fields ?? []).every(field => (fields[field.id] ?? "").trim().length > 0)

  return (
    <div className="panel rounded-xl border-chrome-600 p-5" data-testid={`connect-form-${provider.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-ink">Connect {provider.name}</h3>
          <p className="mt-1 text-xs text-ink-mid">
            {provider.minutes ? `Takes about ${provider.minutes} minute${provider.minutes === 1 ? "" : "s"}.` : null}
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-xs font-semibold text-ink-low hover:text-ink">
          Close
        </button>
      </div>

      <ol className="mt-4 space-y-2.5">
        {provider.steps.map((step, index) => (
          <li key={step} className="flex gap-2.5 text-xs leading-relaxed text-ink-mid">
            <span className="label-mono mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-recess text-[10px] text-ink-low">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>

      {provider.authType === "api_key" && (
        <div className="mt-5 space-y-4 border-t border-line pt-4">
          {(provider.fields ?? []).map(field => (
            <TextField
              key={field.id}
              label={field.label}
              hint={field.hint}
              value={fields[field.id] ?? ""}
              onChange={next => setField(field.id, next)}
              placeholder={field.placeholder}
              type={field.secret ? "password" : "text"}
              mono={field.secret}
              autoComplete="off"
              error={fieldErrors[field.id]}
            />
          ))}

          {formError && (
            <p role="alert" className="text-xs font-semibold text-urgent">
              {formError}
            </p>
          )}
          {testResult?.ok && (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-complete">
              <Check className="h-3.5 w-3.5" /> {testResult.message}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {provider.canTestConnection && (
              <button
                type="button"
                onClick={() => void runTest()}
                disabled={!requiredFilled || testing}
                className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-4 text-sm font-semibold text-ink hover:border-chrome-400 disabled:opacity-50"
              >
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                Test connection
              </button>
            )}
            <button
              type="button"
              onClick={() => void save()}
              disabled={!requiredFilled || saving}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-lg bg-[image:var(--btn-primary-bg)] px-5 text-sm font-bold text-on-accent shadow-hardware hover:brightness-110 disabled:opacity-60"
              )}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {saving ? "Connecting…" : "Connect"}
            </button>
          </div>
        </div>
      )}

      {provider.authType === "oauth_pkce" && (
        <div className="mt-5 border-t border-line pt-4">
          {formError && (
            <p role="alert" className="mb-3 text-xs font-semibold text-urgent">
              {formError}
            </p>
          )}
          <button
            type="button"
            onClick={() => void connectOAuth()}
            disabled={connecting}
            className="flex min-h-11 items-center gap-2 rounded-lg bg-[image:var(--btn-primary-bg)] px-5 text-sm font-bold text-on-accent shadow-hardware hover:brightness-110 disabled:opacity-60"
          >
            {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
            {connecting ? `Opening ${provider.name}…` : `Connect to ${provider.name}`}
            {!connecting && <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          <p className="mt-2 text-xs text-ink-low">You'll sign in on {provider.name}'s own page — FieldLoop never sees your password.</p>
        </div>
      )}
    </div>
  )
}
