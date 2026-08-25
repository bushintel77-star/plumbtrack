import { describe, expect, it, vi } from "vitest";
import {
  CALLOUT_FEE,
  RATE_STANDARD,
  formatDuration,
  gstAmount,
  incGst,
  invoiceTotal,
  labourTotal,
  quoteSubtotal,
  totalClosedSeconds,
} from "../src/lib/billing";
import { dispatchNotification, fetchSlackStatus } from "../src/lib/notifications";
import { API_URL, DEFAULT_ORG_ID } from "../src/lib/constants";

describe("formatDuration", () => {
  it("formats zero seconds", () => {
    expect(formatDuration(0)).toBe("00:00:00");
  });

  it("formats hours, minutes and seconds with padding", () => {
    expect(formatDuration(3723)).toBe("01:02:03");
  });
});

describe("totalClosedSeconds", () => {
  it("sums closed entries (null-end skipped)", () => {
    const entries = [
      { id: "e1", staffId: "tim", start: "2024-01-01T00:00:00.000Z", end: "2024-01-01T00:00:10.000Z", lat: null, lng: null },
      { id: "e2", staffId: "tim", start: "2024-01-01T00:01:00.000Z", end: null, lat: null, lng: null },
    ];
    expect(totalClosedSeconds(entries)).toBe(10);
  });
});

describe("invoice totals", () => {
  it("applies a one-hour minimum and callout fee", () => {
    expect(labourTotal(0)).toBe(RATE_STANDARD);
    expect(invoiceTotal(0)).toBe(RATE_STANDARD + CALLOUT_FEE);
    expect(invoiceTotal(3600)).toBe(RATE_STANDARD + CALLOUT_FEE);
    expect(invoiceTotal(7200)).toBe(RATE_STANDARD * 2 + CALLOUT_FEE);
  });
});

describe("quote totals", () => {
  it("computes subtotal, GST and inc-GST amounts", () => {
    const lines = [
      { id: "a", desc: "x", qty: 2, unit: "ea", rate: 100 },
      { id: "b", desc: "y", qty: 1, unit: "ea", rate: 50 },
    ];
    const subtotal = quoteSubtotal(lines);
    expect(subtotal).toBe(250);
    expect(gstAmount(subtotal)).toBe(25);
    expect(incGst(subtotal)).toBe(275);
  });
});

describe("notification dispatcher client", () => {
  it("posts the notification to the backend dispatcher with the org header", async () => {
    const calls: { url: string; headers: Record<string, string>; body: unknown }[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(url),
        headers: (init?.headers as Record<string, string>) ?? {},
        body: JSON.parse(String(init?.body)),
      });
      return { ok: true, status: 201, text: async () => "created" } as Response;
    }) as typeof fetch;

    try {
      await dispatchNotification({ text: "📍 **Clocked on** at J-1043", channel: "field-updates", author: "plumbtrack" });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${API_URL}/api/notifications`);
    expect(calls[0].headers["x-organization-id"]).toBe(DEFAULT_ORG_ID);
    expect(calls[0].body).toEqual({
      text: "📍 **Clocked on** at J-1043",
      channel: "field-updates",
      author: "plumbtrack",
    });
  });

  it("throws when the dispatcher is unreachable (offline fallback path)", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;

    try {
      await expect(
        dispatchNotification({ text: "hello", channel: "general", author: "tim" }),
      ).rejects.toThrow("network down");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws on a non-2xx dispatcher response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return { ok: false, status: 500, text: async () => "boom" } as Response;
    }) as typeof fetch;

    try {
      await expect(
        dispatchNotification({ text: "hello", channel: "general", author: "tim" }),
      ).rejects.toThrow("Notification dispatch failed (500)");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("reads Slack relay status from the dispatcher", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return { ok: true, status: 200, json: async () => ({ slackConnected: true }) } as Response;
    }) as typeof fetch;

    try {
      await expect(fetchSlackStatus()).resolves.toEqual({ slackConnected: true });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
