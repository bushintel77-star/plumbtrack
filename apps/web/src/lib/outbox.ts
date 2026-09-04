import type { OutboxMediaRecord, OutboxOperation, SyncOp } from "@/types";

const DB_NAME = "plumbtrack-field-store";
const DB_VERSION = 1;
const OP_STORE = "outbox";
const MEDIA_STORE = "media";

const memoryOperations = new Map<string, OutboxOperation>();
const memoryMedia = new Map<string, OutboxMediaRecord>();
const events = typeof window === "undefined" ? null : new EventTarget();
let databasePromise: Promise<IDBDatabase | null> | null = null;

export const OUTBOX_BASE_RETRY_MS = 2_000;
export const OUTBOX_MAX_RETRY_MS = 5 * 60_000;

export function supportsPersistentOutbox(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function emitChange(): void {
  events?.dispatchEvent(new Event("change"));
  // Ask the service worker for a background wake-up where supported. The
  // foreground sync manager remains the source of truth and handles browsers
  // without Background Sync.
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    void navigator.serviceWorker.ready.then((registration) => {
      const syncRegistration = registration as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } };
      return syncRegistration.sync?.register("plumbtrack-outbox");
    }).catch(() => undefined);
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!supportsPersistentOutbox()) return Promise.resolve(null);
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OP_STORE)) {
        const store = database.createObjectStore(OP_STORE, { keyPath: "id" });
        store.createIndex("nextRetryTimestamp", "nextRetryTimestamp", { unique: false });
        store.createIndex("status", "status", { unique: false });
      }
      if (!database.objectStoreNames.contains(MEDIA_STORE)) {
        database.createObjectStore(MEDIA_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("Unable to open IndexedDB"));
    };
  });
  return databasePromise;
}

export function calculateBackoff(retryCount: number, random = Math.random()): number {
  const exponential = Math.min(OUTBOX_MAX_RETRY_MS, OUTBOX_BASE_RETRY_MS * (2 ** Math.max(0, retryCount)));
  // A small jitter prevents many devices reconnecting at the same time from
  // stampeding the API or Slack relay.
  return Math.min(OUTBOX_MAX_RETRY_MS, exponential + Math.floor(exponential * 0.2 * random));
}

export function isTerminalSyncError(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "terminal" in error && (error as { terminal?: unknown }).terminal === true) return true;
  const status = typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: unknown }).status)
    : NaN;
  if (!Number.isInteger(status)) return false;
  // 429 (rate limited) is retryable with backoff — everything else 4xx is terminal.
  if (status === 429) return false;
  return status >= 400 && status < 500;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const status = typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : NaN;
    return Number.isInteger(status) ? `${status}: ${error.message}` : error.message;
  }
  return "Unknown sync error";
}

export async function listOutboxOperations(): Promise<OutboxOperation[]> {
  const database = await openDatabase();
  if (!database) return [...memoryOperations.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const transaction = database.transaction(OP_STORE, "readonly");
  const records = await requestResult(transaction.objectStore(OP_STORE).getAll());
  return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function putOutboxOperation(operation: OutboxOperation): Promise<void> {
  const database = await openDatabase();
  if (!database) {
    memoryOperations.set(operation.id, operation);
    emitChange();
    return;
  }
  const transaction = database.transaction(OP_STORE, "readwrite");
  transaction.objectStore(OP_STORE).put(operation);
  await transactionDone(transaction);
  emitChange();
}

export async function enqueueOutboxOperation(input: Pick<OutboxOperation, "id" | "kind" | "payload" | "dependsOn">): Promise<void> {
  const existing = (await listOutboxOperations()).find((operation) => operation.id === input.id);
  if (existing) return;
  await putOutboxOperation({
    ...input,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    nextRetryTimestamp: 0,
    status: "pending",
  });
}

export async function updateOutboxOperation(id: string, patch: Partial<OutboxOperation>): Promise<void> {
  const operations = await listOutboxOperations();
  const current = operations.find((operation) => operation.id === id);
  if (!current) return;
  await putOutboxOperation({ ...current, ...patch });
}

export async function retryOutboxOperation(id: string): Promise<void> {
  await updateOutboxOperation(id, {
    status: "pending",
    retryCount: 0,
    nextRetryTimestamp: 0,
    lastError: undefined,
  });
}

export async function retryFailedOutboxOperations(): Promise<void> {
  const operations = await listOutboxOperations();
  await Promise.all(operations
    .filter((operation) => operation.status === "failed_requires_user_action")
    .map((operation) => updateOutboxOperation(operation.id, {
      status: "pending",
      retryCount: 0,
      nextRetryTimestamp: 0,
      lastError: undefined,
    })));
}

export async function discardFailedOutboxOperations(): Promise<void> {
  const operations = await listOutboxOperations();
  for (const operation of operations.filter((item) => item.status === "failed_requires_user_action")) {
    const payload = operation.payload as { mediaId?: unknown };
    if (operation.kind === "photo-upload" && typeof payload.mediaId === "string") await removeOutboxMedia(payload.mediaId);
    await removeOutboxOperation(operation.id);
  }
}

export async function removeOutboxOperation(id: string): Promise<void> {
  const database = await openDatabase();
  if (!database) {
    memoryOperations.delete(id);
    emitChange();
    return;
  }
  const transaction = database.transaction(OP_STORE, "readwrite");
  transaction.objectStore(OP_STORE).delete(id);
  await transactionDone(transaction);
  emitChange();
}

export async function putOutboxMedia(record: OutboxMediaRecord): Promise<void> {
  const database = await openDatabase();
  if (!database) {
    memoryMedia.set(record.id, record);
    emitChange();
    return;
  }
  const transaction = database.transaction(MEDIA_STORE, "readwrite");
  transaction.objectStore(MEDIA_STORE).put(record);
  await transactionDone(transaction);
  emitChange();
}

export async function getOutboxMedia(id: string): Promise<OutboxMediaRecord | undefined> {
  const database = await openDatabase();
  if (!database) return memoryMedia.get(id);
  const transaction = database.transaction(MEDIA_STORE, "readonly");
  return requestResult(transaction.objectStore(MEDIA_STORE).get(id));
}

export async function removeOutboxMedia(id: string): Promise<void> {
  const database = await openDatabase();
  if (!database) {
    memoryMedia.delete(id);
    emitChange();
    return;
  }
  const transaction = database.transaction(MEDIA_STORE, "readwrite");
  transaction.objectStore(MEDIA_STORE).delete(id);
  await transactionDone(transaction);
  emitChange();
}

export function subscribeToOutbox(listener: () => void): () => void {
  if (!events) return () => undefined;
  const handler = () => listener();
  events.addEventListener("change", handler);
  return () => events.removeEventListener("change", handler);
}

/** Convert stored media into the current API's URL payload. */
export async function mediaToDataUrl(record: OutboxMediaRecord): Promise<string> {
  if (typeof record.data === "string") return record.data;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Media conversion failed"));
    reader.onerror = () => reject(reader.error ?? new Error("Media conversion failed"));
    reader.readAsDataURL(record.data as Blob);
  });
}

/** Convert local media to a binary body suitable for a signed PUT request. */
export async function mediaToBlob(record: OutboxMediaRecord): Promise<Blob> {
  if (record.data instanceof Blob) return record.data;
  if (record.data.startsWith("data:")) {
    const response = await fetch(record.data);
    if (!response.ok) throw new Error("Media conversion failed");
    return response.blob();
  }
  return new Blob([record.data], { type: record.mimeType || "application/octet-stream" });
}

/** Migrate Stage 1 localStorage operations into the durable outbox. */
export async function migrateLegacyOperations(operations: SyncOp[]): Promise<boolean> {
  if (!supportsPersistentOutbox()) return false;
  for (const operation of operations) {
    await enqueueOutboxOperation({
      id: operation.opId,
      kind: operation.kind,
      payload: operation.kind === "clock-in"
        ? { jobId: operation.jobId, localEntryId: operation.localEntryId, ...operation.payload }
        : operation.kind === "clock-out"
          ? { jobId: operation.jobId, localEntryId: operation.localEntryId, ...operation.payload }
          : operation.kind === "create-job"
            ? { localJobId: operation.localJobId, ...operation.payload }
            : operation.kind === "sync-quote"
              ? { quoteId: operation.quoteId, ...operation.payload }
              : operation.kind === "update-job"
                ? { jobId: operation.jobId, ...operation.payload }
                : operation.payload,
      dependsOn: "dependsOn" in operation ? operation.dependsOn : undefined,
    });
  }
  return true;
}

/** Test-only cleanup; production code never calls this. */
export async function clearOutboxForTests(): Promise<void> {
  memoryOperations.clear();
  memoryMedia.clear();
  if (supportsPersistentOutbox()) {
    const database = await openDatabase();
    if (database) {
      const transaction = database.transaction([OP_STORE, MEDIA_STORE], "readwrite");
      transaction.objectStore(OP_STORE).clear();
      transaction.objectStore(MEDIA_STORE).clear();
      await transactionDone(transaction);
    }
  }
  emitChange();
}
