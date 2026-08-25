import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/lib/api";
import { API_URL, DEFAULT_ORG_ID } from "../src/lib/constants";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetchOnce(response: unknown, status = 200) {
  const calls: { url: string; method?: string; headers: Record<string, string>; body: unknown }[] = [];
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method,
      headers: (init?.headers as Record<string, string>) ?? {},
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return {
      ok: status < 300,
      status,
      json: async () => response,
      text: async () => "",
    } as Response;
  }) as typeof fetch;
  return calls;
}

describe("api time entries (offline sync queue)", () => {
  it("creates a time entry with staffId, start and the idempotency opId", async () => {
    const calls = mockFetchOnce({ id: "cuid-1", staffId: "sarah", start: "2024-01-01T08:00:00.000Z", end: null });
    const created = await api.createTimeEntry("J-1", {
      opId: "op-abc",
      staffId: "sarah",
      start: "2024-01-01T08:00:00.000Z",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${API_URL}/api/jobs/J-1/time-entries`);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers["x-organization-id"]).toBe(DEFAULT_ORG_ID);
    expect(calls[0].body).toEqual({
      opId: "op-abc",
      staffId: "sarah",
      start: "2024-01-01T08:00:00.000Z",
    });
    expect(created.id).toBe("cuid-1");
  });

  it("closes a time entry by its server id", async () => {
    const calls = mockFetchOnce({ id: "cuid-1", staffId: "sarah", start: "2024-01-01T08:00:00.000Z", end: "2024-01-01T09:00:00.000Z" });
    await api.updateTimeEntry("J-1", "cuid-1", { end: "2024-01-01T09:00:00.000Z" });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${API_URL}/api/jobs/J-1/time-entries/cuid-1`);
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].body).toEqual({ end: "2024-01-01T09:00:00.000Z" });
  });

  it("throws when the API is unreachable (op stays queued)", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;

    await expect(
      api.createTimeEntry("J-1", { opId: "op-abc", staffId: "tim", start: "2024-01-01T08:00:00.000Z" }),
    ).rejects.toThrow("network down");
  });
});
