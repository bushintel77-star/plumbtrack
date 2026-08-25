import type { OutboxOperation } from "@/types";
import {
  calculateBackoff,
  enqueueOutboxOperation,
  errorMessage,
  isTerminalSyncError,
  listOutboxOperations,
  removeOutboxOperation,
  subscribeToOutbox,
  updateOutboxOperation,
} from "./outbox";

export class TerminalSyncError extends Error {
  readonly terminal = true;

  constructor(message: string) {
    super(message);
    this.name = "TerminalSyncError";
  }
}

export class DeferredSyncError extends Error {
  readonly deferred = true;

  constructor(message = "Waiting for a dependent operation") {
    super(message);
    this.name = "DeferredSyncError";
  }
}

export type SyncOperationHandler = (operation: OutboxOperation) => Promise<void>;

export function createSyncManager(handler: SyncOperationHandler, intervalMs = 5_000) {
  let stopped = false;
  let flushing: Promise<void> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let unsubscribeOutbox: (() => void) | null = null;
  const onlineHandler = () => { void flush(); };
  const serviceWorkerHandler = (event: MessageEvent) => {
    if (event.data?.type === "PLUMBTRACK_SYNC_REQUEST") void flush();
  };

  async function flush(): Promise<void> {
    if (stopped || flushing) return flushing ?? Promise.resolve();
    flushing = (async () => {
      try {
        let madeProgress = true;
        while (!stopped && madeProgress) {
          madeProgress = false;
          const operations = await listOutboxOperations();
          const byId = new Map(operations.map((operation) => [operation.id, operation]));
          const now = Date.now();

          for (const operation of operations) {
            if (stopped || operation.status === "failed_requires_user_action") continue;
            if (operation.nextRetryTimestamp > now) continue;

            const dependencies = operation.dependsOn ?? [];
            const blockedByFailure = dependencies.some((id) => byId.get(id)?.status === "failed_requires_user_action");
            if (blockedByFailure) {
              await updateOutboxOperation(operation.id, {
                status: "failed_requires_user_action",
                lastError: "A required preceding operation failed and needs attention",
              });
              madeProgress = true;
              continue;
            }
            if (dependencies.some((id) => byId.has(id))) continue;

            await updateOutboxOperation(operation.id, { status: "processing" });
            try {
              await handler(operation);
              await removeOutboxOperation(operation.id);
              madeProgress = true;
            } catch (error) {
              if (error instanceof DeferredSyncError) {
                await updateOutboxOperation(operation.id, { status: "pending" });
                continue;
              }
              const message = errorMessage(error);
              if (isTerminalSyncError(error)) {
                await updateOutboxOperation(operation.id, {
                  status: "failed_requires_user_action",
                  lastError: message,
                });
                madeProgress = true;
                continue;
              }
              const retryCount = operation.retryCount + 1;
              await updateOutboxOperation(operation.id, {
                status: "pending",
                retryCount,
                nextRetryTimestamp: Date.now() + calculateBackoff(retryCount),
                lastError: message,
              });
            }
          }
        }
      } catch {
        // IndexedDB and network failures must not escape from a background
        // trigger such as `online` or a service-worker message. The operation
        // remains durable and will be retried by the next foreground pass.
      } finally {
        flushing = null;
      }
    })();
    return flushing;
  }

  function start(): () => void {
    if (typeof window !== "undefined") {
      window.addEventListener("online", onlineHandler);
      navigator.serviceWorker?.addEventListener("message", serviceWorkerHandler);
      unsubscribeOutbox = subscribeToOutbox(() => { void flush(); });
      timer = setInterval(() => { void flush(); }, intervalMs);
    }
    void flush();
    return stop;
  }

  function stop(): void {
    stopped = true;
    if (timer) clearInterval(timer);
    if (typeof window !== "undefined") {
      window.removeEventListener("online", onlineHandler);
      navigator.serviceWorker?.removeEventListener("message", serviceWorkerHandler);
      unsubscribeOutbox?.();
      unsubscribeOutbox = null;
    }
  }

  return { start, stop, flush };
}

/** Convert a Stage 1 operation into the new outbox shape for callers/tests. */
export { enqueueOutboxOperation };
