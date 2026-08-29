import type { JSX } from "react"
import { useMemo, useState } from "react"
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native"
import { useRouter } from "expo-router"
import { Typography } from "heroui-native"

import { StatusChip } from "@/components/StatusChip"
import { SyncBadge } from "@/components/SyncBadge"
import { refreshJobs, useFieldState } from "@/state/store"

/**
 * JOBS tab — today's work, biggest signal first: emergency, then the live
 * job, then scheduled, then done. Cards are full-width press targets
 * (gloved-thumb sized); status is chip + icon + label, never colour alone.
 */
export default function JobsScreen(): JSX.Element {
  const router = useRouter()
  const jobs = useFieldState(state => state.jobs)
  const jobsLoadedAt = useFieldState(state => state.jobsLoadedAt)
  const [refreshing, setRefreshing] = useState(false)
  const [query, setQuery] = useState("")

  const ordered = useMemo(() => {
    const rank = (status: string, jobType?: string) => {
      if (jobType === "emergency" && status !== "completed") return 0
      if (status === "in_progress") return 1
      if (status === "scheduled") return 2
      return 3
    }
    const needle = query.trim().toLowerCase()
    return [...jobs]
      .filter(
        job =>
          needle === "" ||
          job.client.toLowerCase().includes(needle) ||
          job.address.toLowerCase().includes(needle) ||
          job.scope.toLowerCase().includes(needle)
      )
      .sort((a, b) => rank(a.status, a.jobType) - rank(b.status, b.jobType))
  }, [jobs, query])

  const onRefresh = async () => {
    setRefreshing(true)
    await refreshJobs()
    setRefreshing(false)
  }

  return (
    <View className="flex-1 bg-background px-4 pt-14">
      <View className="mb-3 flex-row items-center justify-between">
      <Typography type="h3" weight="bold">
        {"Today's jobs"}
      </Typography>
        <SyncBadge />
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="SEARCH CLIENT · ADDRESS · SCOPE"
        placeholderTextColor="#8b94a6"
        className="mb-3 rounded-lg border border-line bg-surface px-3 py-3 font-mono text-[13px] text-ink"
      />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor="#4e8cff" />}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {ordered.map(job => (
          <Pressable
            key={job.id}
            onPress={() => router.push(`/job/${job.id}`)}
            className="mb-2 rounded-xl border border-line bg-surface p-4"
          >
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Typography type="body" weight="semibold" truncate>
                  {job.client}
                </Typography>
                <Typography type="body-xs" color="muted" className="mt-0.5" truncate>
                  {job.address}
                </Typography>
                <Typography type="body-xs" color="muted" className="mt-1" truncate>
                  {job.scope}
                </Typography>
              </View>
              <StatusChip job={job} />
            </View>
            {job.timeEntries.some(entry => entry.end === null) && (
              <Text className="mt-2 font-mono text-[12px] font-bold text-active">
                ● BILLING NOW
              </Text>
            )}
          </Pressable>
        ))}
        {ordered.length === 0 && jobsLoadedAt && (
          <View className="mt-10 items-center rounded-xl border border-dashed border-line p-6">
            <Typography type="body" weight="semibold">
              No jobs match
            </Typography>
            <Typography type="body-xs" color="muted" className="mt-1">
              Clear the search or pull to refresh.
            </Typography>
          </View>
        )}
      </ScrollView>
    </View>
  )
}
