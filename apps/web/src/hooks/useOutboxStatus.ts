"use client";

import { useEffect, useState } from "react";
import type { OutboxOperation } from "@/types";
import { listOutboxOperations, subscribeToOutbox } from "@/lib/outbox";

export interface OutboxStatus {
  pending: number;
  processing: number;
  failed: number;
  mediaPending: number;
  updatePending: number;
  label: string;
}

const EMPTY_STATUS: OutboxStatus = {
  pending: 0,
  processing: 0,
  failed: 0,
  mediaPending: 0,
  updatePending: 0,
  label: "All updates synced",
};

function toStatus(operations: OutboxOperation[]): OutboxStatus {
  const active = operations.filter((operation) => operation.status !== "failed_requires_user_action");
  const mediaPending = active.filter((operation) => operation.kind === "photo-upload").length;
  const failed = operations.filter((operation) => operation.status === "failed_requires_user_action").length;
  const processing = operations.filter((operation) => operation.status === "processing").length;
  const pending = operations.filter((operation) => operation.status === "pending").length;
  const updatePending = active.filter((operation) => operation.kind !== "photo-upload").length;

  let label = "All updates synced";
  if (failed > 0) label = `${failed} update${failed === 1 ? "" : "s"} needs attention`;
  else if (mediaPending > 0) label = `Uploading ${mediaPending} photo${mediaPending === 1 ? "" : "s"}…`;
  else if (updatePending > 0) label = `Syncing ${updatePending} update${updatePending === 1 ? "" : "s"}…`;

  return { pending, processing, failed, mediaPending, updatePending, label };
}

export function useOutboxStatus(): OutboxStatus {
  const [status, setStatus] = useState(EMPTY_STATUS);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void listOutboxOperations().then((operations) => {
        if (!cancelled) setStatus(toStatus(operations));
      }).catch(() => undefined);
    };
    refresh();
    const unsubscribe = subscribeToOutbox(refresh);
    const interval = window.setInterval(refresh, 2_000);
    return () => {
      cancelled = true;
      unsubscribe();
      window.clearInterval(interval);
    };
  }, []);

  return status;
}
