import type { JSX } from "react"
import { useState } from "react"
import { Pressable, ScrollView, View } from "react-native"
import { Button, Typography } from "heroui-native"
import { LogOut } from "lucide-react-native"

import { SyncSheet } from "@/components/SyncSheet"
import { interpretStoredShift } from "@/lib/award"
import { config } from "@/lib/config"
import {
  endBreak,
  logOffShift,
  startBreak,
  useFieldState
} from "@/state/store"

/**
 * PROFILE tab (mockup fusion) — the day's ledger: identity, clock status
 * with break control, TODAY stats in the display face, the MA000036
 * payable readout, and the DATA card — the redesigned sync surface: no
 * manual button, state + queue counts + last write, tap for the exception
 * sheet. Syncing was always automatic; this card explains it.
 */
export default function ProfileScreen(): JSX.Element {
  const shift = useFieldState(state => state.shift)
  const shifts = useFieldState(state => state.shifts)
  const jobs = useFieldState(state => state.jobs)
  const live = useFieldState(state => state.live)
  const outbox = useFieldState(state => state.outbox)
  const lastSyncedAt = useFieldState(state => state.lastSyncedAt)
  const [logOffOpen, setLogOffOpen] = useState(false)
  const [dataSheetOpen, setDataSheetOpen] = useState(false)

  const complete = jobs.filter(job => job.status === "completed").length
  const preview = shift
    ? interpretStoredShift(shift, shifts.find(s => s.loggedOffAt)?.loggedOffAt ?? null)
    : null
  const onBreak = Boolean(shift?.breaks.some(brk => brk.end === null))
  const pending = outbox.filter(op => op.status === "pending").length
  const failed = outbox.filter(op => op.status === "failed_requires_user_action").length

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 18 }}>
        <View className="flex-row items-center gap-3.5">
          <View className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-[1.5px] border-accent bg-overlay">
            <View className="font-display text-[19px] font-bold text-ink">DM</View>
          </View>
          <View className="flex-1">
            <View className="text-[16px] font-semibold text-ink">Dave Mitchell</View>
            <View className="mt-0.5 text-[13px] text-ink-muted">
              Licensed Plumber · {config.orgName}
            </View>
          </View>
        </View>

        <View className="gap-2.5 rounded-xl border border-line bg-surface p-3.5">
          <Typography className="font-mono text-[11px] uppercase tracking-[0.07em] text-ink-muted">
            CLOCK STATUS
          </Typography>
          <View className="text-[15px] font-medium text-ink">
            {shift ? `On shift — ${shift.workType}` : "Off shift"}
          </View>
          {shift && (
            <View className="flex-row gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1"
                onPress={() => (onBreak ? endBreak() : startBreak())}
              >
                {onBreak ? "END BREAK" : "START BREAK"}
              </Button>
              <Button variant="danger" className="flex-1" onPress={() => setLogOffOpen(true)}>
                LOG OFF
              </Button>
            </View>
          )}
        </View>

        <View>
          <Typography className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted">
            TODAY
          </Typography>
          <View className="flex-row gap-2.5">
            <View className="flex-1 items-center rounded-xl border border-line bg-surface py-3.5">
              <View className="font-display text-[28px] font-extrabold leading-none text-success">{complete}</View>
              <View className="mt-1.5 text-[11px] text-ink-muted">Complete</View>
            </View>
            <View className="flex-1 items-center rounded-xl border border-line bg-surface py-3.5">
              <View className="font-display text-[28px] font-extrabold leading-none text-warning">
                {jobs.length - complete}
              </View>
              <View className="mt-1.5 text-[11px] text-ink-muted">Remaining</View>
            </View>
            <View className="flex-1 items-center rounded-xl border border-line bg-surface py-3.5">
              <View className="font-display text-[28px] font-extrabold leading-none text-ink">{jobs.length}</View>
              <View className="mt-1.5 text-[11px] text-ink-muted">Total jobs</View>
            </View>
          </View>
        </View>

        {preview && (
          <View className="gap-1.5 rounded-xl border border-line bg-surface p-3.5">
            <Typography className="font-mono text-[11px] uppercase tracking-[0.07em] text-ink-muted">
              PAYABLE SO FAR (MA000036)
            </Typography>
            <View className="font-display text-[30px] font-extrabold leading-none text-ink">
              ${preview.grossPay.toFixed(2)}
            </View>
            <View className="font-mono text-[12px] text-ink-muted">
              {preview.totalHours.toFixed(2)} HRS
            </View>
            {preview.notes.slice(0, 2).map(note => (
              <Typography key={note} className="text-[12px] text-warning">
                {note}
              </Typography>
            ))}
          </View>
        )}

        <View>
          <Typography className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted">
            DATA
          </Typography>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Data and queue details"
            onPress={() => setDataSheetOpen(true)}
            className="gap-2.5 rounded-xl border border-line bg-surface p-3.5"
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <View
                  className={`h-2 w-2 rounded-full ${
                    failed > 0 ? "bg-danger" : pending > 0 ? "bg-warning" : live === "live" ? "bg-active" : "bg-ink-muted"
                  }`}
                />
                <View className="text-[13px] font-medium text-ink">
                  {failed > 0
                    ? `${failed} need attention`
                    : pending > 0
                      ? `${pending} queued`
                      : live === "live"
                        ? "Live — streaming"
                        : live === "connecting"
                          ? "Connecting…"
                          : "Offline — everything waits safely"}
                </View>
              </View>
            </View>
            <View className="font-mono text-[12px] text-ink-muted">
              Last write {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : "pending"} · tap for
              details
            </View>
            <Typography type="body-xs" color="muted">
              Everything syncs automatically when a connection exists — photos, clocks and
              completions queue on-device and drain themselves. Nothing to press.
            </Typography>
          </Pressable>
        </View>

        <View className="items-center pt-1">
          <Typography className="font-mono text-[11px] text-ink-muted">
            FieldLoop v1 · {config.forceDemo ? "DEMO MODE" : "LIVE"} · {jobs.length} cached locally
          </Typography>
        </View>
      </ScrollView>

      {logOffOpen && shift && (
        <View className="absolute inset-0 justify-end bg-black/60">
          <View className="gap-3 rounded-t-3xl border border-line bg-surface p-5 pb-10">
            <View className="flex-row items-center gap-2">
              <LogOut size={18} color="#1faa59" />
              <View className="font-display text-[24px] font-bold text-ink">Log off shift</View>
            </View>
            {preview && (
              <View>
                {preview.components.map(component => (
                  <View key={component.code} className="flex-row justify-between py-1">
                    <View className="flex-1 text-[13px] text-ink">{component.label}</View>
                    <View className="font-mono text-[13px] text-ink-muted">
                      {component.hours.toFixed(2)}h · ${component.amount.toFixed(2)}
                    </View>
                  </View>
                ))}
                <View className="mt-2 border-t border-line pt-2">
                  <View className="text-[15px] font-bold text-ink">
                    Total {preview.totalHours.toFixed(2)} hrs · ${preview.grossPay.toFixed(2)}
                  </View>
                </View>
              </View>
            )}
            <View className="mt-1 flex-row gap-2">
              <Button variant="outline" className="flex-1" onPress={() => setLogOffOpen(false)}>
                CANCEL
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onPress={() => {
                  logOffShift()
                  setLogOffOpen(false)
                }}
              >
                CONFIRM LOG OFF
              </Button>
            </View>
          </View>
        </View>
      )}

      {dataSheetOpen && <SyncSheet onClose={() => setDataSheetOpen(false)} />}
    </View>
  )
}
