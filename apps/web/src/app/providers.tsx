"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { isRetryableApiError } from "@/lib/api";

/**
 * TanStack Query provider — the dispatch data plane.
 *
 * v1 uses short-interval REST polling (5s) rather than WebSockets: stateless
 * requests survive Railway redeploys and connection blips without ghost
 * sockets or reconciliation logic, and the library gives us retry with
 * backoff, background refetch on window focus, and cache invalidation for
 * free. Sub-second push (SSE/WebSockets) can layer on later for live GPS.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Only transient failures retry (network drop, timeout, 5xx) —
            // terminal 4xx errors fail fast instead of hammering the API.
            retry: (failureCount, error) => isRetryableApiError(error) && failureCount < 3,
            refetchOnWindowFocus: true,
            refetchIntervalInBackground: false,
            staleTime: 4_000,
            gcTime: 5 * 60_000,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
