import { NuqsAdapter } from "nuqs/adapters/next/app"

import { Providers } from "../providers"

/** Console-only bootstrap, scoped to the interactive dispatch surfaces so the
 *  landing page and other static routes never start console machinery. */
export default function ConsoleLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <NuqsAdapter>
      <Providers>{children}</Providers>
    </NuqsAdapter>
  )
}
