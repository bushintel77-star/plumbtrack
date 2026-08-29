import type { JSX } from "react"
import { useMemo, useState } from "react"
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native"
import { useRouter } from "expo-router"
import { ChevronRight } from "lucide-react-native"

import { StatusChip } from "@/components/StatusChip"
import { refreshJobs, useFieldState } from "@/state/store"

/**
 * JOBS tab (mockup fusion) — the hero count in the display face ("how much
 * day is left" at a glance), and cards whose status is readable from the
 * silhouette: the 5px left bar is the emergency/attention/complete channel,
 * the chip carries colour + icon + label. Emergency first, then live, then
 * scheduled, then done.
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

  const statusBar = (status: string, jobType?: string): string => {
    if (jobType === "emergency" && status !== "completed") return "bg-danger"
    if (status === "in_progress") return "bg-active"
    if (status === "scheduled") return "bg-warning"
    return "bg-success"
  }

  return (
    <View className="flex-1 bg-background px-4 pt-4">
      <View className="flex-row items-end justify-between">
        <View>
          <View className="font-display text-[30px] font-bold leading-none text-ink">{"Today's Jobs"}</View>
          <View className="mt-1.5 text-[13px] text-ink-muted">
            {new Date().toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}
          </View>
        </View>
        <View className="flex-row items-baseline gap-1.5">
          <View className="font-display text-[38px] font-extrabold leading-none text-accent">
            {ordered.length}
          </View>
          <View className="text-[13px] text-ink-muted">jobs</View>
        </View>
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={"SEARCH CLIENT · ADDRESS · SCOPE"}
        placeholderTextColor="#93a4b1"
        className="mb-3 mt-3 rounded-lg border border-line bg-surface px-3 py-3 font-mono text-[13px] text-ink"
      />

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor="#4f90ff" />
        }
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {ordered.map(job => (
          <Pressable
            key={job.id}
            onPress={() => router.push(`/job/${job.id}`)}
            className="mb-2.5 flex-row overflow-hidden rounded-xl border border-line bg-surface"
          >
            <View className={`w-[5px] shrink-0 ${statusBar(job.status, job.jobType)}`} />
            <View className="min-w-0 flex-1 p-3.5">
              <View className="mb-1.5 flex-row items-center justify-between">
                <StatusChip job={job} />
                {job.timeEntries.some(entry => entry.end === null) && (
                  <View className="font-mono text-[11px] font-bold text-active">● BILLING NOW</View>
                )}
              </View>
              <View className="text-[15px] font-semibold text-ink">{job.client}</View>
              <Text className="mt-0.5 text-[13px] text-ink-muted" numberOfLines={1}>
                {job.address}
              </Text>
            </View>
            <View className="mx-2.5 self-center">
              <ChevronRight size={18} color="#596773" />
            </View>
          </Pressable>
        ))}
        {ordered.length === 0 && jobsLoadedAt && (
          <View className="mt-10 items-center rounded-xl border border-dashed border-line-strong p-6">
            <View className="font-display text-[20px] font-bold text-ink">No jobs match</View>
            <View className="mt-1 text-[13px] text-ink-muted">Clear the search or pull to refresh.</View>
          </View>
        )}
      </ScrollView>
    </View>
  )
}
