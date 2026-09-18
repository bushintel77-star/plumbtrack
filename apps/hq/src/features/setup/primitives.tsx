"use client"

import { useId, useRef, useState, type ReactNode } from "react"
import { Check, Eye, EyeOff, Info } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Setup wizard primitives — one question at a time, chips instead of typing,
 * and the explanation beside the control rather than in a manual somewhere.
 *
 * Accessibility: chip groups are real radio/checkbox groups with roving arrow
 * keys; every input has a label, a hint tied by aria-describedby, and errors
 * announced in the same place.
 */

export function StepHeading({
  index,
  total,
  title,
  lede
}: {
  index: number
  total: number
  title: string
  lede: string
}) {
  return (
    <header>
      <p className="label-mono text-2xs text-chrome-600">STEP {index} OF {total}</p>
      <h1 className="mt-2 font-display text-3xl font-bold leading-tight tracking-tight text-ink">{title}</h1>
      <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-ink-mid">{lede}</p>
    </header>
  )
}

export function Question({
  label,
  hint,
  children,
  error,
  optional
}: {
  label: string
  /** Sits beside the control: what this is, and what it changes. */
  hint?: string
  children: ReactNode
  error?: string | null
  optional?: boolean
}) {
  return (
    /* Desk settings-row: label column, control column, hint column at lg.
       Below lg it's the same stacked order as before — hint first, then
       label, then control. DOM order does the column placement at lg, so
       no explicit col-start is needed. */
    <section className="grid gap-3 border-t border-line py-4 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)_280px] lg:gap-x-8">
      <div className="order-2 flex items-baseline gap-2 lg:order-none lg:pt-2">
        <h2 className="text-sm font-semibold text-ink">{label}</h2>
        {optional && <span className="label-mono text-2xs text-ink-low">OPTIONAL</span>}
      </div>
      <div className="order-3 min-w-0 lg:order-none">
        {children}
        {error && (
          <p className="mt-2.5 text-xs font-semibold text-urgent" role="alert">
            {error}
          </p>
        )}
      </div>
      {hint && (
        <aside className="order-1 flex gap-2 text-xs leading-relaxed text-ink-mid lg:order-none lg:self-start lg:pt-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-chrome-400" aria-hidden="true" />
          <span>{hint}</span>
        </aside>
      )}
    </section>
  )
}

export interface ChipOption<T extends string> {
  value: T
  label: string
  /** One short line under the label — what choosing this does. */
  note?: string
  recommended?: boolean
}

/** Single-select chips (radio semantics, arrow-key navigation). */
export function ChipChoice<T extends string>({
  options,
  value,
  onChange,
  label
}: {
  options: readonly ChipOption<T>[]
  value: T | undefined
  onChange: (value: T) => void
  label: string
}) {
  const groupRef = useRef<HTMLDivElement>(null)

  const move = (delta: number, index: number) => {
    const next = (index + delta + options.length) % options.length
    onChange(options[next].value)
    const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>("[role='radio']")
    buttons?.[next]?.focus()
  }

  return (
    <div ref={groupRef} role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (!value && index === 0) ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={event => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault()
                move(1, index)
              }
              if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault()
                move(-1, index)
              }
            }}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-full border px-4 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              selected
                ? "border-chrome-600 bg-chrome-wash font-semibold text-chrome-600"
                : "border-line bg-card text-ink hover:border-chrome-400"
            )}
          >
            {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
            <span>
              {option.label}
              {option.note && <span className="ml-2 text-xs font-normal text-ink-low">{option.note}</span>}
            </span>
            {option.recommended && !selected && (
              <span className="label-mono text-2xs text-ink-low">SUGGESTED</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Multi-select chips (checkbox semantics). */
export function ChipMulti<T extends string>({
  options,
  values,
  onChange,
  label
}: {
  options: readonly ChipOption<T>[]
  values: T[]
  onChange: (values: T[]) => void
  label: string
}) {
  const toggle = (value: T) => {
    onChange(values.includes(value) ? values.filter(entry => entry !== value) : [...values, value])
  }
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map(option => {
        const selected = values.includes(option.value)
        return (
          <button
            key={option.value}
            type="button"
            role="checkbox"
            aria-checked={selected}
            onClick={() => toggle(option.value)}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-full border px-4 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              selected
                ? "border-chrome-600 bg-chrome-wash font-semibold text-chrome-600"
                : "border-line bg-card text-ink hover:border-chrome-400"
            )}
          >
            {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
            <span>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** A number the operator nudges rather than types. */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  prefix,
  suffix
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  label: string
  prefix?: string
  suffix?: string
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next))
  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(clamp(value - step))}
        aria-label={`Decrease ${label}`}
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-card text-lg font-semibold text-ink hover:border-chrome-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        −
      </button>
      <output
        aria-label={label}
        className="min-w-24 rounded-lg border border-line bg-recess px-4 py-2.5 text-center font-mono text-sm tabular-nums text-ink"
      >
        {prefix}{value}{suffix}
      </output>
      <button
        type="button"
        onClick={() => onChange(clamp(value + step))}
        aria-label={`Increase ${label}`}
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-card text-lg font-semibold text-ink hover:border-chrome-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        +
      </button>
    </div>
  )
}

/** Text input — used only where a chip genuinely can't answer the question. */
export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  type = "text",
  mono,
  autoComplete,
  inputMode,
  maxLength,
  right,
  reveal,
  width = "full",
  labelHidden = false
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hint?: string
  error?: string | null
  type?: "text" | "password" | "email" | "tel"
  mono?: boolean
  autoComplete?: string
  inputMode?: "text" | "numeric" | "tel" | "email"
  maxLength?: number
  /** Sized to the data it holds: short for bounded codes (ABN, postcode,
   *  phone), medium for names, full for addresses and free text. Below sm
   *  every field is full-width regardless. */
  width?: "short" | "medium" | "full"
  /** Hides the visible micro-label when the surrounding Question already
   *  says the same thing — kept sr-only so the input stays labelled for
   *  screen readers (htmlFor/id wiring is untouched). */
  labelHidden?: boolean
  /** A button that sits with the input, e.g. Look up or Test connection. */
  right?: ReactNode
  /** Password fields get a reveal toggle by default; pass false to suppress
   *  it. Currently unused — kept as the opt-out if a field ever needs it. */
  reveal?: boolean
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  /* Reveal is opt-out-able but on by default for passwords: a mistyped
     character is invisible otherwise, and "Incorrect email or password" is
     the same message whether the password was wrong or simply fat-fingered.
     Starts hidden, and never persists — a reveal survives no re-render of
     the page. */
  const [revealed, setRevealed] = useState(false)
  const isPassword = type === "password" && reveal !== false
  return (
    <div>
      <label htmlFor={id} className={cn("label-mono text-2xs text-ink-low", labelHidden && "sr-only")}>
        {label.toUpperCase()}
      </label>
      <div className="mt-1.5 flex gap-2">
        <div className={cn("relative w-full min-w-0", width === "short" && "sm:max-w-56", width === "medium" && "sm:max-w-96")}>
          <input
            id={id}
            type={isPassword && revealed ? "text" : type}
            value={value}
            onChange={event => onChange(event.target.value)}
            placeholder={placeholder}
            autoComplete={autoComplete}
            inputMode={inputMode}
            maxLength={maxLength}
            aria-describedby={cn(hint && hintId, error && errorId) || undefined}
            aria-invalid={error ? true : undefined}
            className={cn(
              "min-h-11 w-full rounded-lg border bg-card px-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-low focus:border-chrome-600 focus-visible:ring-2 focus-visible:ring-ring/60",
              mono && "font-mono",
              isPassword && "pr-11",
              error ? "border-urgent" : "border-line"
            )}
          />
          {isPassword && (
            <button
              /* type="button" matters: inside a form the default is submit,
                 so revealing the password would post it. */
              type="button"
              onClick={() => setRevealed(current => !current)}
              aria-label={revealed ? "Hide password" : "Show password"}
              aria-pressed={revealed}
              aria-controls={id}
              title={revealed ? "Hide password" : "Show password"}
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-r-lg text-ink-low transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
        {right}
      </div>
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs leading-relaxed text-ink-mid">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 text-xs font-semibold text-urgent" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/** The bar at the bottom of every step: where you are, and what's next. */
export function StepFooter({
  onBack,
  onNext,
  onSkip,
  nextLabel,
  busy,
  canGoBack,
  skipLabel
}: {
  onBack: () => void
  onNext: () => void
  onSkip?: () => void
  /** Names the step they're going to, so Next is never a mystery. */
  nextLabel: string
  busy?: boolean
  canGoBack: boolean
  skipLabel?: string
}) {
  /* Rendered as a sibling of the content column, not inside it, so the bar
     backs the full main width — page content can never sit beside it. The
     inner row shares the content column's padding and upper bound. */
  return (
    <div className="sticky bottom-0 mt-8 border-t border-line bg-card px-6 py-4">
      <div className="flex w-full max-w-[1160px] flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={!canGoBack || busy}
          className="min-h-11 rounded-lg border border-line px-4 text-sm font-semibold text-ink-mid hover:border-chrome-400 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={busy}
          className="min-h-11 rounded-lg bg-[image:var(--btn-primary-bg)] px-5 text-sm font-bold text-on-accent shadow-hardware transition-all hover:brightness-110 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          {busy ? "Saving…" : nextLabel}
        </button>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            disabled={busy}
            className="min-h-11 px-2 text-sm text-ink-low underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {skipLabel ?? "Skip for now"}
          </button>
        )}
        <span className="label-mono ml-auto text-2xs text-ink-low">SAVED AS YOU GO</span>
      </div>
    </div>
  )
}
