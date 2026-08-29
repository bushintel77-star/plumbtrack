import type { JSX } from "react"
import { View, Text } from "react-native"

import { statusStyleFor } from "@/lib/statusStyles"
import type { Job } from "@/types"

/** Status chip — colour + icon + label, never colour alone. Gloved-glance
 *  sized (14px label) per the FSM design spec. */
export function StatusChip({ job }: { job: Pick<Job, "status" | "jobType"> }): JSX.Element {
  const style = statusStyleFor(job)
  const Icon = style.icon
  return (
    <View className={`flex-row items-center gap-1.5 rounded-md px-2.5 py-1.5 ${style.chip}`}>
      <Icon size={14} color="#ffffff" />
      <Text className="font-mono text-[13px] font-bold uppercase tracking-wide text-white">
        {style.label}
      </Text>
    </View>
  )
}
