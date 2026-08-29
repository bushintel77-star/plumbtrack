import type { JSX } from "react"
import { useState } from "react"
import { Pressable, Text, View } from "react-native"
import { CloudOff } from "lucide-react-native"

import { SyncSheet } from "@/components/SyncSheet"
import { LivePulseDot } from "@/components/CommitSpring"
import { useFieldState } from "@/state/store"

/**
 * The live/sync badge — the single honest indicator (mobile-fsm-ui-design
 * §offline states). Healthy state is LIVE; the queue only surfaces when
 * writes are waiting or need a decision. Tapping opens the exception sheet;
 * sync is never a tab, never a chore.
 */
export function SyncBadge(): JSX.Element {
  const live = useFieldState(state => state.live)
  const outbox = useFieldState(state => state.outbox)
  const [sheetOpen, setSheetOpen] = useState(false)

  const pending = outbox.filter(op => op.status === "pending").length
  const failed = outbox.filter(op => op.status === "failed_requires_user_action").length

  let tone = "bg-surface"
  let label = live === "live" ? "LIVE" : live === "connecting" ? "CONNECTING" : "OFFLINE"
  if (pending > 0) {
    tone = "bg-warning"
    label = `${pending} QUEUED`
  }
  if (failed > 0) {
    tone = "bg-danger"
    label = `${failed} NEEDS ATTENTION`
  }

  return (
    <View>
      <Pressable onPress={() => setSheetOpen(true)} className="rounded-md px-2 py-1">
        <View className={`flex-row items-center gap-1.5 rounded-md px-2 py-1 ${tone}`}>
          {live === "live" && failed === 0 && pending === 0 ? (
            <LivePulseDot active />
          ) : (
            <CloudOff size={13} color="#ffffff" />
          )}
          <Text
            className={`font-mono text-[12px] font-bold ${
              failed > 0 || pending > 0 ? "text-white" : live === "live" ? "text-active" : "text-ink-muted"
            }`}
          >
            {label}
          </Text>
        </View>
      </Pressable>
      {sheetOpen && <SyncSheet onClose={() => setSheetOpen(false)} />}
    </View>
  )
}
