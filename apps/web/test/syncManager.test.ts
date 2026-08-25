import { beforeEach, describe, expect, it } from "vitest";
import { HttpError } from "../src/lib/errors";
import {
  calculateBackoff,
  clearOutboxForTests,
  enqueueOutboxOperation,
  getOutboxMedia,
  listOutboxOperations,
  putOutboxMedia,
  putOutboxOperation,
  updateOutboxOperation,
} from "../src/lib/outbox";
import { createSyncManager } from "../src/lib/syncManager";

beforeEach(async () => {
  await clearOutboxForTests();
});

describe("IndexedDB outbox sync manager", () => {
  it("calculates bounded exponential backoff with jitter", () => {
    expect(calculateBackoff(0, 0)).toBe(2_000);
    expect(calculateBackoff(1, 0)).toBe(4_000);
    expect(calculateBackoff(20, 0)).toBe(5 * 60_000);
    expect(calculateBackoff(1, 1)).toBe(4_800);
  });

  it("marks a 4xx operation terminal instead of retrying", async () => {
    await enqueueOutboxOperation({
      id: "terminal-1",
      kind: "notification",
      payload: { text: "invalid", channel: "field-updates", author: "tim" },
    });
    const manager = createSyncManager(async () => { throw new HttpError(422, "invalid payload"); });

    await manager.flush();
    const [operation] = await listOutboxOperations();
    expect(operation.status).toBe("failed_requires_user_action");
    expect(operation.retryCount).toBe(0);
    expect(operation.lastError).toContain("422");
  });

  it("backs off transient failures and succeeds when the retry becomes due", async () => {
    let attempts = 0;
    await enqueueOutboxOperation({
      id: "transient-1",
      kind: "notification",
      payload: { text: "retry", channel: "field-updates", author: "tim" },
    });
    const manager = createSyncManager(async () => {
      attempts += 1;
      if (attempts === 1) throw new HttpError(503, "temporarily unavailable");
    });

    await manager.flush();
    let [operation] = await listOutboxOperations();
    expect(operation.status).toBe("pending");
    expect(operation.retryCount).toBe(1);
    expect(operation.nextRetryTimestamp).toBeGreaterThan(Date.now());

    await updateOutboxOperation(operation.id, { nextRetryTimestamp: 0 });
    await manager.flush();
    expect(await listOutboxOperations()).toHaveLength(0);
  });

  it("stores media offline and flushes a dependent HQ update after it", async () => {
    await putOutboxMedia({
      id: "photo-1",
      data: "data:image/jpeg;base64,heavy-mock-photo",
      mimeType: "image/jpeg",
      createdAt: new Date().toISOString(),
    });
    await enqueueOutboxOperation({
      id: "upload-1",
      kind: "photo-upload",
      payload: { jobId: "J-1", label: "Before", mediaId: "photo-1" },
    });
    await enqueueOutboxOperation({
      id: "notify-1",
      kind: "notification",
      dependsOn: ["upload-1"],
      payload: { text: "Photo uploaded", channel: "field-updates", author: "plumbtrack" },
    });

    expect(await getOutboxMedia("photo-1")).toMatchObject({ mimeType: "image/jpeg" });
    const order: string[] = [];
    const manager = createSyncManager(async (operation) => { order.push(operation.id); });
    await manager.flush();

    expect(order).toEqual(["upload-1", "notify-1"]);
    expect(await listOutboxOperations()).toHaveLength(0);
  });

  it("does not lose a queued notification when an operation is enqueued twice", async () => {
    const input = { id: "same-id", kind: "notification" as const, payload: { text: "once" } };
    await enqueueOutboxOperation(input);
    await enqueueOutboxOperation(input);
    expect(await listOutboxOperations()).toHaveLength(1);
  });
});
