import type { JSX } from "react"
import { useEffect, useState } from "react"
import { Text, View } from "react-native"

/**
 * Elapsed-time display — JetBrains Mono with tabular figures so the digits
 * never jitter as seconds tick. Teal while billing (the ONLY live colour).
 */
export function TimerDigits({ since, active }: { since: string; active: boolean }): JSX.Element {
  // `now` starts at `since` (pure) so render stays impurity-free; the first
  // interval tick lands the real clock within a second.
  const [nowMs, setNowMs] = useState(() => new Date(since).getTime())
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const elapsedMs = Math.max(0, nowMs - new Date(since).getTime())
  const totalSeconds = Math.floor(elapsedMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const digits = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`

  return (
    <View className="flex-row items-baseline gap-2">
      <Text
        className={`font-mono text-4xl font-bold tnum ${active ? "text-active" : "text-ink-muted"}`}
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {digits}
      </Text>
    </View>
  )
}
