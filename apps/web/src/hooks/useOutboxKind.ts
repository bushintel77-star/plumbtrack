"use client";

import { useEffect, useState } from "react";
import type { OutboxOperationKind } from "@/types";
import { listOutboxOperations, subscribeToOutbox } from "@/lib/outbox";
import type { SyncBadgeState } from "@/components/ui/StatusChip";

export interface KindStatus {
  state: SyncBadgeState;
  count: number;
}

const EMPTY: KindStatus = { state: "synced", count: 0 };

function toKindStatus(operations: { kind: OutboxOperationKind; status: string }[]): KindStatus {
  const active = operations.filter((op) => op.status !== "failed_requires_user_action");
  if (active.length === 0) {
    const failed = operations.length;
    return failed > 0 ? { state: "failed", count: failed } : EMPTY;
  }
  const processing = active.some((op) => op.status === "processing");
  return { state: processing ? "syncing" : "queued", count: active.length };
}

/**
 * Offline-honesty status for one outbox operation kind (e.g. photo uploads
 * pending for the capture bar's Photo slot).
 */
export function useOutboxKind(kind: OutboxOperationKind): KindStatus {
  const [status, setStatus] = useState<KindStatus>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void listOutboxOperations()
        .then((operations) => {
          if (cancelled) return;
          setStatus(toKindStatus(operations.filter((op) => op.kind === kind).map((op) => ({ kind: op.kind, status: op.status }))));
        })
        .catch(() => undefined);
    };
    refresh();
    const unsubscribe = subscribeToOutbox(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [kind]);

  return status;
}
