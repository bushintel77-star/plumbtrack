import type { JSX } from "react"
import { useState } from "react"
import { Pressable, View } from "react-native"
import { Button, Typography } from "heroui-native"
import { MapPin } from "lucide-react-native"

import { config } from "@/lib/config"
import { captureEvidenceFix } from "@/lib/fieldActions"
import { logOnShift } from "@/state/store"
import type { ShiftWorkType } from "@/types"

const WORK_TYPES: Array<{ id: ShiftWorkType; label: string }> = [
  { id: "standard", label: "Standard" },
  { id: "callback", label: "Call-back" },
  { id: "inclement", label: "Inclement" }
]

/**
 * Clock-in gateway (mockup fusion) — the shift-start ceremony. This is the
 * one BRAND screen of the working app: display-face wordmark, radial glow
 * (the second of our two glow moments), greeting, and the two decisions
 * that matter — the MA000036 work type and the single glowing CTA. The
 * location disclosure is the honest-contract line: point-in-time capture,
 * never background tracking.
 */
export function ClockInGateway(): JSX.Element {
  const [workType, setWorkType] = useState<ShiftWorkType>("standard")
  const [loggingOn, setLoggingOn] = useState(false)

  const handleLogOn = async () => {
    if (loggingOn) return
    setLoggingOn(true)
    const coords = await captureEvidenceFix()
    logOnShift(workType, coords)
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
  const dateLine = new Date().toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })

  return (
    <View className="absolute inset-0 flex flex-col bg-background px-5 pb-8 pt-14">
      {/* Radial glow — layered translucent circles (signature moment #2). */}
      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <View className="h-64 w-64 rounded-full" style={{ backgroundColor: "rgba(79,144,255,0.07)" }} />
        <View
          className="absolute h-40 w-40 rounded-full"
          style={{ backgroundColor: "rgba(79,144,255,0.10)" }}
        />
      </View>

      <View className="flex-row justify-end">
        <View className="rounded-full border border-line-strong bg-overlay px-2.5 py-1.5">
          <Typography className="font-mono text-[12px] text-ink-muted">
            {config.forceDemo ? "DEMO · OFFLINE READY" : "FIELD DEVICE"}
          </Typography>
        </View>
      </View>

      <View className="flex-1 items-center justify-center">
        <View className="font-display text-[42px] font-extrabold tracking-[0.09em] text-ink">
          FIELDLOOP
        </View>
        <Typography type="body-sm" color="muted" className="mt-1">
          {config.orgName}
        </Typography>
        <Typography type="body" className="mt-7">
          {greeting}, <Typography type="body" weight="semibold">Dave</Typography>
        </Typography>
        <Typography className="mt-1 font-mono text-[13px] text-ink-muted">{dateLine}</Typography>
      </View>

      <View className="gap-3">
        <View className="rounded-xl border border-line bg-surface p-3">
          <Typography className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted">
            WORK TYPE (MA000036)
          </Typography>
          <View className="mt-2 flex-row gap-2">
            {WORK_TYPES.map(type => (
              <Pressable
                key={type.id}
                onPress={() => setWorkType(type.id)}
                accessibilityRole="button"
                accessibilityLabel={`Work type ${type.label}`}
                className={`flex-1 items-center rounded-lg border px-3 py-3.5 ${
                  workType === type.id ? "border-active bg-active" : "border-line bg-background"
                }`}
              >
                <Typography
                  className={`font-mono text-[13px] font-semibold ${
                    workType === type.id ? "text-white" : "text-ink-muted"
                  }`}
                >
                  {type.label.toUpperCase()}
                </Typography>
              </Pressable>
            ))}
          </View>
        </View>

        <View className="flex-row items-start gap-2.5 rounded-xl border border-line bg-surface p-3">
          <View className="mt-0.5">
            <MapPin size={15} color="#4f90ff" />
          </View>
          <Typography type="body-xs" color="muted" className="flex-1 leading-snug">
            Logging on records your location once, right now, as award evidence. FieldLoop never
            tracks location in the background.
          </Typography>
        </View>

        <Button variant="primary" className="w-full" size="lg" onPress={() => void handleLogOn()}>
          {loggingOn ? "CAPTURING LOCATION…" : "LOG ON"}
        </Button>
      </View>
    </View>
  )
}
