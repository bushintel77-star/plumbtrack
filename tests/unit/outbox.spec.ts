import { describe, expect, it, vi } from "vitest"
import { HttpError, NetworkError } from "@/lib/api"
import { calculateBackoff, isTerminalSyncError } from "@/lib/outbox"

// Pure-semantics test: the native storage modules never load in node.
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined }
}))
vi.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined
}))

describe("outbox semantics (AsyncStorage port)", () => {
  it("network failures are retryable, 4xx are terminal, 429/5xx retry", () => {
    expect(isTerminalSyncError(new NetworkError("offline"))).toBe(false)
    expect(isTerminalSyncError(new HttpError(409, "conflict"))).toBe(true)
    expect(isTerminalSyncError(new HttpError(422, "invalid"))).toBe(true)
    expect(isTerminalSyncError(new HttpError(429, "throttled"))).toBe(false)
    expect(isTerminalSyncError(new HttpError(503, "down"))).toBe(false)
  })

  it("backoff grows exponentially with jitter and caps at 5 minutes", () => {
    vi.spyOn(Math, "random").mockReturnValue(0)
    expect(calculateBackoff(0)).toBe(2000)
    expect(calculateBackoff(1)).toBe(4000)
    expect(calculateBackoff(2)).toBe(8000)
    expect(calculateBackoff(10)).toBe(5 * 60_000)
    vi.restoreAllMocks()
  })

  it("backoff stays inside the capped envelope even with max jitter", () => {
    vi.spyOn(Math, "random").mockReturnValue(1)
    for (let retry = 0; retry < 12; retry++) {
      const delay = calculateBackoff(retry)
      expect(delay).toBeLessThanOrEqual(5 * 60_000)
    }
    vi.restoreAllMocks()
  })
})
