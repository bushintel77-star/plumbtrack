import type { JSX } from "react"
import { ScrollView, Text, View } from "react-native"
import { Button, Typography } from "heroui-native"

import { discardFailedOperations, retryFailedOperations } from "@/lib/outbox"
import { revertFailedOperation } from "@/lib/fieldActions"
import { useFieldState } from "@/state/store"

/**
 * Sync sheet — the exception surface. Draining is automatic; this sheet
 * exists only for the rare op that needs a human decision (terminal 4xx).
 * Reached by tapping the live/sync badge — sync is never a destination.
 */
export function SyncSheet({ onClose }: { onClose: () => void }): JSX.Element {
  const outbox = useFieldState(state => state.outbox)
  const lastSyncedAt = useFieldState(state => state.lastSyncedAt)
  const failed = outbox.filter(op => op.status === "failed_requires_user_action")

  return (
    <View className="absolute inset-0 justify-end bg-black/60">
      <View className="rounded-t-3xl border border-line bg-surface p-5 pb-10">
        <View className="flex-row items-center justify-between">
          <Typography type="h4" weight="bold">
            Queued writes
          </Typography>
          <Button variant="ghost" onPress={onClose}>
            CLOSE
          </Button>
        </View>
        <Typography type="body-xs" color="muted" className="mt-1">
          Everything drains automatically when a connection exists — last write{" "}
          {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : "pending"}.
        </Typography>

        {failed.length > 0 && (
          <View className="mt-3 rounded-lg bg-background p-3">
            <Typography type="body-xs" className="text-danger">
              {failed.length} write{failed.length > 1 ? "s" : ""} need a decision
            </Typography>
            {failed.slice(0, 5).map(op => (
              <Text key={op.id} className="mt-1 font-mono text-[11px] text-ink-muted" numberOfLines={1}>
                {op.kind.replace("-", " ").toUpperCase()} — {op.lastError ?? "rejected"}
              </Text>
            ))}
            <View className="mt-3 flex-row gap-2">
              <Button variant="outline" className="flex-1" onPress={() => void retryFailedOperations()}>
                RETRY
              </Button>
              <Button
                variant="danger-soft"
                className="flex-1"
                onPress={() => {
                  // DISCARD also rolls back the optimistic board patch —
                  // the app returns to what the server actually has.
                  for (const op of failed) revertFailedOperation(op)
                  void discardFailedOperations()
                }}
              >
                DISCARD
              </Button>
            </View>
          </View>
        )}

        {outbox.length > 0 ? (
          <ScrollView className="mt-3 max-h-48">
            {outbox.slice(0, 20).map(op => (
              <View key={op.id} className="flex-row items-center justify-between border-b border-line py-2.5">
                <View className="flex-1">
                  <Text className="font-mono text-[13px] font-bold text-ink">
                    {op.kind.replace("-", " ").toUpperCase()}
                  </Text>
                  {op.lastError && (
                    <Text className="mt-0.5 font-mono text-[11px] text-danger" numberOfLines={1}>
                      {op.lastError}
                    </Text>
                  )}
                </View>
                <Text
                  className={`font-mono text-[11px] font-bold ${
                    op.status === "pending" ? "text-warning" : "text-danger"
                  }`}
                >
                  {op.status === "pending" ? (op.retryCount > 0 ? `RETRY ${op.retryCount}` : "QUEUED") : "NEEDS ACTION"}
                </Text>
              </View>
            ))}
          </ScrollView>
        ) : (
          <Typography type="body-sm" color="muted" className="mt-3">
            Queue empty — everything is synced.
          </Typography>
        )}
      </View>
    </View>
  )
}
