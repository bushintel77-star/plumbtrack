import type { JSX } from "react"
import { useState } from "react"
import { Linking, Pressable, ScrollView, Text, View } from "react-native"
import { useLocalSearchParams, useRouter } from "expo-router"
import { Button, Typography } from "heroui-native"
import * as ImagePicker from "expo-image-picker"
import { Check, ChevronLeft, KeyRound } from "lucide-react-native"

import { StatusChip } from "@/components/StatusChip"
import { TimerDigits } from "@/components/TimerDigits"
import {
  completeJobWithEvidence,
  startJobClock,
  stopJobClock,
  toggleChecklistItem
} from "@/lib/fieldActions"
import { useFieldState } from "@/state/store"

/**
 * JOB detail — everything needed for a first-time fix in one screen:
 * client contact, access, scope, checklist, parts, the billing clock, and
 * photo evidence. Primary actions are bottom-anchored (thumb zone);
 * committing actions confirm in a sheet.
 */
export default function JobDetailScreen(): JSX.Element {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const job = useFieldState(state => state.jobs.find(item => item.id === id))
  const [confirmComplete, setConfirmComplete] = useState(false)

  if (!job) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Typography type="body" color="muted">
          Job not found
        </Typography>
      </View>
    )
  }

  const openEntry = job.timeEntries.find(entry => entry.end === null)
  const billing = Boolean(openEntry)

  const capturePhoto = async () => {
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, base64: true })
    if (result.canceled || !result.assets[0]?.base64) return
    // Photo evidence rides the outbox (3-step signed upload at flush time).
    const { enqueue } = await import("@/lib/outbox")
    const { patchJob } = await import("@/state/store")
    await enqueue("photo-upload", {
      jobId: job.id,
      base64: result.assets[0].base64,
      contentType: "image/jpeg"
    })
    patchJob(job.id, {
      photos: [
        ...job.photos,
        { id: `ph-${Date.now().toString(36)}`, jobId: job.id, uri: result.assets[0].uri, createdAt: new Date().toISOString() }
      ]
    })
  }

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center gap-3 px-4 pb-2 pt-14">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back to jobs"
          className="rounded-lg bg-surface p-2"
        >
          <ChevronLeft size={20} color="#ffffff" />
        </Pressable>
        <View className="flex-1">
          <Typography type="h4" weight="bold" truncate>
            {job.client}
          </Typography>
          <Typography type="body-xs" color="muted" truncate>
            {job.id.toUpperCase()} · {job.address}
          </Typography>
        </View>
        <StatusChip job={job} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        <View className="rounded-2xl border border-line bg-surface p-4">
          <Typography type="body-xs" color="muted">
            SCOPE
          </Typography>
          <Typography type="body" className="mt-1">
            {job.scope}
          </Typography>

          <View className="mt-4 flex-row gap-2">
            {job.phone && (
              <Button
                variant="outline"
                className="flex-1"
                onPress={() => void Linking.openURL(`tel:${job.phone}`)}
              >
                CALL CLIENT
              </Button>
            )}
            {job.accessCode && (
              <View className="flex-row items-center gap-1.5 rounded-lg border border-line bg-background px-3">
                <KeyRound size={14} color="#8b94a6" />
                <Text className="font-mono text-[13px] font-bold text-ink">{job.accessCode}</Text>
              </View>
            )}
          </View>
        </View>

        <View className="mt-3 rounded-2xl border border-line bg-surface p-4">
          <Typography type="body-xs" color="muted">
            BILLING CLOCK
          </Typography>
          <View className="mt-2">
            {openEntry ? (
              <TimerDigits since={openEntry.start} active />
            ) : (
              <Text className="font-mono text-4xl font-bold text-ink-muted">00:00:00</Text>
            )}
          </View>
        </View>

        {job.serviceItems && job.serviceItems.length > 0 && (
          <View className="mt-3 rounded-2xl border border-line bg-surface p-4">
            <Typography type="body-xs" color="muted">
              PARTS / SERVICE ITEMS
            </Typography>
            {job.serviceItems.map(item => (
              <View key={item.id} className="flex-row justify-between py-1.5">
                <Typography type="body-xs" className="flex-1">
                  {item.description} × {item.qty}
                </Typography>
                <Typography type="body-xs" className="font-mono text-ink-muted">
                  ${item.rate.toFixed(2)}
                </Typography>
              </View>
            ))}
          </View>
        )}

        {job.checklists && job.checklists.length > 0 && (
          <View className="mt-3 rounded-2xl border border-line bg-surface p-4">
            <Typography type="body-xs" color="muted">
              CHECKLIST
            </Typography>
            <View className="mt-2.5 gap-2">
              {job.checklists.map(item => {
                const done = Boolean(item.completedAt)
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => void toggleChecklistItem(job.id, item.id, !done)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: done }}
                    accessibilityLabel={item.label}
                    className="flex-row items-center gap-3 rounded-lg border border-line bg-background px-3 py-3"
                  >
                    <View
                      className={`flex h-[22px] w-[22px] items-center justify-center rounded-md border-[1.75px] ${
                        done ? "border-success bg-success" : "border-line-strong"
                      }`}
                    >
                      {done && <Check size={14} color="#0a0e13" />}
                    </View>
                    <View
                      className={`flex-1 text-[14px] ${done ? "text-ink-muted line-through" : "text-ink"}`}
                    >
                      {item.label}
                    </View>
                  </Pressable>
                )
              })}
            </View>
            <Typography type="body-xs" color="muted" className="mt-2">
              Instantiated from the job-type template + quoted scope. Completion syncs to the office.
            </Typography>
          </View>
        )}

        <View className="mt-3 rounded-2xl border border-line bg-surface p-4">
          <View className="flex-row items-center justify-between">
            <Typography type="body-xs" color="muted">
              PHOTO EVIDENCE · {job.photos.length}
            </Typography>
            <Button variant="outline" onPress={() => void capturePhoto()}>
              CAPTURE
            </Button>
          </View>
          {job.photos.length > 0 && (
            <View className="mt-3 flex-row flex-wrap gap-2">
              {job.photos.map(photo => (
                <View key={photo.id} className="h-16 w-16 rounded-md bg-overlay" />
              ))}
            </View>
          )}
          <Typography type="body-xs" color="muted" className="mt-2">
            Photos upload automatically when a connection is available — queued captures are never lost.
          </Typography>
        </View>
      </ScrollView>

      {/* Thumb-zone primary actions */}
      <View className="absolute inset-x-0 bottom-0 flex-row gap-2 border-t border-line bg-surface p-4 pb-8">
        {job.status !== "completed" && (
          <>
            {billing ? (
              <Button variant="outline" className="flex-1" onPress={() => void stopJobClock(job.id)}>
                STOP CLOCK
              </Button>
            ) : (
              <Button variant="primary" className="flex-1" onPress={() => void startJobClock(job.id)}>
                START CLOCK
              </Button>
            )}
            <Button variant="primary" className="flex-1" onPress={() => setConfirmComplete(true)}>
              COMPLETE
            </Button>
          </>
        )}
      </View>

      {confirmComplete && (
        <View className="absolute inset-0 justify-end bg-black/60">
          <View className="rounded-t-3xl border border-line bg-surface p-5 pb-10">
            <Typography type="h4" weight="bold">
              Complete this job?
            </Typography>
            <Typography type="body-sm" color="muted" className="mt-1">
              {billing
                ? "The open clock entry will be closed at completion time."
                : "The customer sign-off sheet follows on the next visit; this closes the job on the board."}
            </Typography>
            <View className="mt-4 flex-row gap-2">
              <Button variant="outline" className="flex-1" onPress={() => setConfirmComplete(false)}>
                CANCEL
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onPress={() => {
                  void (async () => {
                    if (billing) await stopJobClock(job.id)
                    await completeJobWithEvidence(job.id)
                    setConfirmComplete(false)
                  })()
                }}
              >
                CONFIRM COMPLETE
              </Button>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
