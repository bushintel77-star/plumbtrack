import type { Metadata } from "next"
import { Big_Shoulders, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google"

import "./globals.css"

/** Display face — wordmarks, hero numerals and panel headings only. */
const bigShoulders = Big_Shoulders({
  weight: ["700", "800"],
  subsets: ["latin"],
  variable: "--font-big-shoulders",
  display: "swap"
})

/** Body and UI text. */
const plexSans = IBM_Plex_Sans({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-plex-sans",
  display: "swap"
})

/** Every changing or column-aligned value: times, dates, IDs, currency. */
const plexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
  display: "swap"
})

export const metadata: Metadata = {
  title: "PlumbTrack HQ — Dispatch Command Center",
  description:
    "Dispatcher command center: dashboard, schedule board, live technician timers, quotes and compliance."
}

/**
 * Root layout provides the type system for the whole app. Console-only
 * bootstrap (query client, Slack bridge, sync worker) lives in the
 * `(console)` route group so static surfaces — like the landing page — stay
 * lean and never start console machinery.
 */
export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en-AU"
      className={`${bigShoulders.variable} ${plexSans.variable} ${plexMono.variable}`}
      translate="no"
    >
      <head>
        {/* Native Chrome/Edge translate prompt suppressed — the console is
            English-only operations UI and the popup steals focus on load. */}
        <meta name="google" content="notranslate" />
      </head>
      <body>{children}</body>
    </html>
  )
}
