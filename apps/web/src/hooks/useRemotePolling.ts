"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { listOutboxOperations } from "@/lib/outbox";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import type { Action } from "@/state/actions";

export const DISPATCH_POLL_INTERVAL_MS = 5_000;

/**
 * Near-real-time dispatch data over short-interval REST polling.
 *
 * Every 5 seconds (and on window focus) the jobs/quotes snapshot is fetched
 * and merged through the same MERGE_REMOTE path the boot sync uses — quotes
 * with a pending outbox operation stay protected from the merge, and local
 * pending time entries survive dedupe. Offline: polling stops entirely;
 * when connectivity returns the next poll self-heals with no manual
 * reconnect. A failed poll never touches local state.
 */
export function useRemotePolling(dispatch: (action: Action) => void) {
  const online = useOnlineStatus();

  const query = useQuery({
    queryKey: ["remote-sync", "jobs-quotes"],
    queryFn: async () => {
      const [jobs, quotes, ops] = await Promise.all([
        api.listJobs(),
        api.listQuotes(),
        listOutboxOperations(),
      ]);
      return { jobs, quotes, ops };
    },
    enabled: online,
    refetchInterval: DISPATCH_POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    staleTime: DISPATCH_POLL_INTERVAL_MS - 1_000,
  });

  useEffect(() => {
    const data = query.data;
    if (!data) return;
    const protectedQuoteIds = [
      ...new Set(
        data.ops
          .filter((op) => op.kind === "sync-quote")
          .map((op) => String((op.payload as { quoteId?: unknown }).quoteId ?? "")),
      ),
    ].filter(Boolean);
    dispatch({ type: "MERGE_REMOTE", jobs: data.jobs, quotes: data.quotes, protectedQuoteIds });
    // MERGE_REMOTE is idempotent for identical snapshots; dispatch identity
    // is stable, so this only re-runs when a new poll result arrives.
  }, [query.data, dispatch]);
}
