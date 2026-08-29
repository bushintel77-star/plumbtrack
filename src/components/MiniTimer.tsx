import type { JSX } from "react"
import { useEffect, useState } from "react"
import { Text, View } from "react-native"

import { interpretStoredShift } from "@/lib/award"
import { useFieldState } from "@/state/store"
import type { ShiftWorkType } from "@/types"

/**
 * The meter in the header strip: live elapsed time (tabular mono digits)
 * plus the MA000036 payable-so-far readout — the award engine running
 * while the plumber works, not just at log-off.
 */
export function MiniTimer({ since, workType }: { since: string; workType: ShiftWorkType }): JSX.Element {
  const shifts = useFieldState(state => state.shifts)
  const [nowMs, setNowMs] = useState(() => new Date(since).getTime())

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const elapsedMs = Math.max(0, nowMs - new Date(since).getTime())
  const totalSeconds = Math.floor(elapsedMs / 1000)
  const digits = `${String(Math.floor(totalSeconds / 3600)).padStart(2, "0")}:${String(
    Math.floor((totalSeconds % 3600) / 60)
  ).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`

  // Live award preview against the running shift.
  const shift = useFieldState(state => state.shift)
  const preview = shift ? interpretStoredShift(shift, shifts.find(s => s.loggedOffAt)?.loggedOffAt ?? null) : null

  return (
    <View className="flex-row items-baseline gap-2">
      <Text className="font-mono text-[12px] font-medium text-active tnum" style={{ fontVariant: ["tabular-nums"] }}>
        {digits}
      </Text>
      {preview && (
        <Text className="font-mono text-[12px] text-ink-muted">
          · {workType.toUpperCase()} · {preview.totalHours.toFixed(2)}H ${preview.grossPay.toFixed(0)}
        </Text>
      )}
    </View>
  )
}
