"use client"

import type { ReactNode } from "react"
import Link from "next/link"

/**
 * Shared chrome for the public account pages (/login, /signup,
 * /forgot-password, /reset-password, /invite/[token]). Plain centred panel
 * in the Blueprint light colourway — these pages render before any session
 * exists, so they never mount console machinery or the dark theme class.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="panel rounded-xl p-8">
          <Link href="/landing" className="flex items-center gap-2.5" aria-label="Crewline home">
            <div className="btn-primary flex h-9 w-9 items-center justify-center rounded-md text-xs font-black text-on-accent">
              FL
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-ink">Crewline</div>
              <div className="label-mono text-2xs text-ink-low">FIELD SERVICE OPS</div>
            </div>
          </Link>
          <h1 className="mt-6 text-base font-bold text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 text-xs leading-relaxed text-ink-mid">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>
        {footer && <div className="mt-4 text-center text-xs text-ink-mid">{footer}</div>}
      </div>
    </div>
  )
}
