import { ConsoleLoading } from "@/features/shell/ConsoleLoading"

/**
 * Console route loading boundary — replaces the blank white flash while the
 * HQ client bundle loads and hydrates (Next.js renders this inside a Suspense
 * boundary during navigation and first load).
 */
export default function Loading() {
  return <ConsoleLoading />
}
