import Link from "next/link"
import type { Metadata } from "next"

import { LiveTimer } from "@/features/landing/LiveTimer"

export const metadata: Metadata = {
  title: "PlumbTrack — field service for Melbourne plumbers",
  description:
    "The technician captures the job, the office gets the records, and the customer signs off on the spot. Field service management for a small plumbing business."
}

const screens = [
  { src: "/landing/off-duty.png", label: "Off duty", caption: "Clock in when you arrive — GPS captured at the door." },
  { src: "/landing/on-shift.png", label: "On shift", caption: "The job, the timer and the route in one hand." },
  { src: "/landing/on-break.png", label: "On break", caption: "Leave resets the single-active timer; nothing is lost." },
  { src: "/landing/shift-complete.png", label: "Shift complete", caption: "One tap drops the job to complete and frees the day." },
  { src: "/landing/logoff.png", label: "Log off", caption: "Allowance and travel captured on the way out." },
  { src: "/landing/timesheet.png", label: "Timesheet", caption: "Time and travel reconcile to the day, ready for payroll." }
]

const features = [
  {
    title: "A day that writes itself",
    body: "Appointments, timers and quotes live on one board. Drag a job to a crew and the hours, evidence and invoice follow without re-typing anything."
  },
  {
    title: "Evidence at the point of work",
    body: "Before/after photos, voice notes and a customer signature are captured on site, then audit-trailed to the job for the office and the accountant."
  },
  {
    title: "Offline by default",
    body: "Losing signal delays sync, not the work. The field queue is idempotent — a retry can never duplicate time, a photo or a signature."
  }
]

const trust = ["OFFLINE-FIRST", "IDEMPOTENT QUEUE", "AUDIT-TRAILED", "TENANT-SCOPED"]

const stats = [
  { value: "20", label: "30-MIN DAY BLOCKS" },
  { value: "05", label: "TAPS TO FINISH A JOB (TARGET)" },
  { value: "0", label: "DOUBLE ENTRY — ONE RECORD, EVERY DEPARTMENT" }
]

export default function LandingPage() {
  return (
    <div className="dark min-h-dvh bg-chrome-void text-ink">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-chrome-void/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-xs font-black text-on-accent">
              PT
            </span>
            <span className="font-display text-lg font-bold tracking-[0.07em]">PLUMBTRACK</span>
          </Link>
          <nav className="ml-auto hidden items-center gap-5 sm:flex" aria-label="Landing sections">
            <a className="label-mono text-2xs text-ink-mid transition-colors hover:text-ink" href="#field">
              FIELD APP
            </a>
            <a className="label-mono text-2xs text-ink-mid transition-colors hover:text-ink" href="#office">
              HQ CONSOLE
            </a>
            <a className="label-mono text-2xs text-ink-mid transition-colors hover:text-ink" href="#trust">
              TRUST
            </a>
          </nav>
          <Link
            href="/"
            className="btn-primary inline-flex h-9 items-center rounded-lg px-4 text-xs font-semibold text-on-accent"
          >
            Open console
          </Link>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto w-full max-w-6xl px-5 pb-24 pt-16 sm:pt-20">
          <div className="grid gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <p className="label-mono text-2xs text-chrome-400">
                CAULFIELD SOUTH PLUMBING · FIELD SERVICE, MELBOURNE
              </p>
              <h1 className="mt-6 font-display text-5xl font-extrabold leading-[0.92] tracking-tight sm:text-7xl">
                From the van to the invoice, in one hand.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-mid">
                PlumbTrack is the field service layer for a small plumbing business. The technician finishes a
                call-out with the fewest taps; the office gets the time, the evidence and a signed job; the
                accountant gets a clean record.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link
                  href="/"
                  className="btn-primary inline-flex h-11 items-center rounded-lg px-5 text-sm font-semibold text-on-accent"
                >
                  Open the console
                </Link>
                <a
                  href="#field"
                  className="label-mono inline-flex h-11 items-center rounded-lg border border-line px-5 text-2xs text-ink-mid transition-colors hover:text-ink"
                >
                  SEE THE FIELD APP ↓
                </a>
              </div>

              <ul className="mt-14 grid max-w-xl grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
                {stats.map(stat => (
                  <li key={stat.label} className="bg-recess p-5">
                    <div className="tnum font-display text-4xl font-extrabold">{stat.value}</div>
                    <div className="label-mono mt-2 text-2xs leading-relaxed text-ink-low">{stat.label}</div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Field app hero card + live timer */}
            <div className="relative mx-auto w-full max-w-[320px]">
              <div className="overflow-hidden rounded-[28px] border border-line bg-recess p-2 shadow-chassis">
                <img
                  src="/landing/on-shift.png"
                  alt="A technician on shift in the PlumbTrack field app"
                  className="w-full rounded-[20px]"
                />
              </div>
              <div className="absolute -bottom-6 left-1/2 flex w-[92%] -translate-x-1/2 items-center justify-between gap-3 rounded-xl border border-line bg-recess px-4 py-3 shadow-chassis">
                <div className="min-w-0">
                  <div className="label-mono text-2xs text-ink-low">J-1042 · KITCHEN MIXER TAP</div>
                  <div className="mt-1 truncate text-xs text-ink-mid">Dana · En route</div>
                </div>
                <LiveTimer />
              </div>
            </div>
          </div>
        </section>

        {/* Field app gallery */}
        <section id="field" className="scroll-mt-14 border-t border-line bg-recess/40">
          <div className="mx-auto w-full max-w-6xl px-5 py-24">
            <p className="label-mono text-2xs text-chrome-400">THE FIELD APP</p>
            <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
              A technician&apos;s day, on one screen.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-mid">
              Every state of the working day — capture, timer, evidence, log-off — is a single tap, built for
              gloves and a concrete basement with no signal.
            </p>

            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {screens.map(screen => (
                <figure key={screen.src}>
                  <div className="overflow-hidden rounded-xl border border-line bg-recess shadow-chassis">
                    <img
                      src={screen.src}
                      alt={`${screen.label} — PlumbTrack field app`}
                      loading="lazy"
                      className="aspect-[420/860] w-full object-cover"
                    />
                  </div>
                  <figcaption className="mt-3 px-1">
                    <span className="label-mono text-2xs text-chrome-400">{screen.label}</span>
                    <p className="mt-1 text-xs leading-relaxed text-ink-mid">{screen.caption}</p>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* Office / HQ console */}
        <section id="office" className="scroll-mt-14">
          <div className="mx-auto w-full max-w-6xl px-5 py-24">
            <p className="label-mono text-2xs text-chrome-400">THE HQ CONSOLE</p>
            <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
              The office watches the day, not a spreadsheet.
            </h2>
            <div className="mt-14 grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3">
              {features.map(feature => (
                <article key={feature.title} className="bg-recess p-7">
                  <h3 className="font-display text-2xl font-bold tracking-tight">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-ink-mid">{feature.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Trust strip */}
        <section id="trust" className="scroll-mt-14 border-t border-line bg-recess/40">
          <div className="mx-auto w-full max-w-6xl px-5 py-16">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
              {trust.map(item => (
                <span key={item} className="label-mono text-2xs text-ink-mid">
                  <span className="mr-2 text-chrome-400">●</span>
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="border-t border-line">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-5 py-24 text-center">
            <h2 className="font-display text-4xl font-extrabold tracking-tight sm:text-6xl">
              See the day build itself.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-mid">
              Open the dispatch console and watch the board, the timers and the routes come together.
            </p>
            <Link
              href="/"
              className="btn-primary mt-9 inline-flex h-11 items-center rounded-lg px-6 text-sm font-semibold text-on-accent"
            >
              Open the console
            </Link>
            <p className="label-mono mt-8 text-2xs text-ink-low">
              PROTOTYPE · BUILT FOR CAULFIELD SOUTH, MELBOURNE
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6">
          <span className="label-mono text-2xs text-ink-low">
            PLUMBTRACK · FIELD SERVICE RECORDS FOR A PLUMBING BUSINESS
          </span>
          <a className="label-mono text-2xs text-ink-mid transition-colors hover:text-ink" href="#">
            TOP ↑
          </a>
        </div>
      </footer>
    </div>
  )
}
