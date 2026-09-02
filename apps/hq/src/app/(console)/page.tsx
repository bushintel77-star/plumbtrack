import { Suspense } from "react"

import { AppShell } from "@/features/shell/AppShell"
import Loading from "./loading"

export default function HomePage() {
  return (
    <Suspense fallback={<Loading />}>
      <AppShell />
    </Suspense>
  )
}
