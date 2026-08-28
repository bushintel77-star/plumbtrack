import type { Metadata } from "next"
import { Lato, JetBrains_Mono } from "next/font/google"
import { NuqsAdapter } from "nuqs/adapters/next/app"

import "./globals.css"

import { Providers } from "./providers"

const lato = Lato({
  weight: ["400", "700", "900"],
  subsets: ["latin"],
  variable: "--font-lato",
  display: "swap"
})

const jetbrains = JetBrains_Mono({
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap"
})

export const metadata: Metadata = {
  title: "PlumbTrack HQ — Dispatch Command Center",
  description:
    "Dispatcher command center: dashboard, schedule board, live technician timers, quotes and compliance."
}

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU" className={`${lato.variable} ${jetbrains.variable}`} translate="no">
      <head>
        {/* Native Chrome/Edge translate prompt suppressed — the console is
            English-only operations UI and the popup steals focus on load. */}
        <meta name="google" content="notranslate" />
        {/* Apply the saved colourway before first paint (no dark flash). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{if(localStorage.getItem('hq-theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}})()"
          }}
        />
      </head>
      <body>
        <NuqsAdapter>
          <Providers>{children}</Providers>
        </NuqsAdapter>
      </body>
    </html>
  )
}
