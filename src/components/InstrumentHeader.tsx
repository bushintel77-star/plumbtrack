import type { JSX } from "react"
import { View } from "react-native"
import { MapPin } from "lucide-react-native"

import { SyncBadge } from "@/components/SyncBadge"
import { MiniTimer } from "@/components/MiniTimer"
import { useFieldState } from "@/state/store"

/**
 * Instrument header — the persistent cluster across every tab (mockup
 * fusion): FIELDLOOP wordmark in the display face, the live/sync badge,
 * and the honesty strip — shift state, payable-so-far from the MA000036
 * engine, and the point-in-time GPS disclosure. The strip is what makes
 * the app an instrument: the worker's day, metered, always visible.
 */
export function InstrumentHeader(): JSX.Element {
  const shift = useFieldState(state => state.shift)

  return (
    <View className="shrink-0 border-b border-line bg-surface px-4 pb-2.5 pt-12">
      <View className="flex-row items-center justify-between">
        <View className="font-display text-[19px] font-bold tracking-[0.08em] text-ink">
          FIELDLOOP
        </View>
        <SyncBadge />
      </View>

      {shift ? (
        <View className="mt-2 flex-row items-center gap-1.5">
          <MapPin size={13} color="#4f90ff" />
          <MiniTimer since={shift.loggedOnAt} workType={shift.workType} />
        </View>
      ) : (
        <View className="mt-2 flex-row items-center gap-1.5">
          <MapPin size={13} color="#4f90ff" />
          <View className="font-mono text-[12px] text-ink-muted">
            Off shift · location only ever captured at log-on
          </View>
        </View>
      )}
    </View>
  )
}
