import { afterEach, describe, expect, it, vi } from "vitest";
import { isSlackConfigured, relayToSlack, slackChannelFor } from "../src/lib/slack";

const originalFetch = globalThis.fetch;

afterEach(() => {
  delete process.env.SLACK_WEBHOOK_URL;
  globalThis.fetch = originalFetch;
});

describe("slackChannelFor", () => {
  it("prefixes channel ids with #", () => {
    expect(slackChannelFor("field-updates")).toBe("#field-updates");
  });

  it("keeps an already-prefixed channel", () => {
    expect(slackChannelFor("#jobs")).toBe("#jobs");
  });

  it("returns undefined for DM channels (webhook default channel is used)", () => {
    expect(slackChannelFor("dm-sarah")).toBeUndefined();
  });

  it("returns undefined for empty input", () => {
    expect(slackChannelFor("   ")).toBeUndefined();
  });
});

describe("isSlackConfigured", () => {
  it("is false when no webhook URL is set", () => {
    expect(isSlackConfigured()).toBe(false);
  });

  it("is true when a webhook URL is set", () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/T/TOKEN";
    expect(isSlackConfigured()).toBe(true);
  });
});

describe("relayToSlack", () => {
  it("reports not-delivered without calling the webhook when unconfigured", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(relayToSlack("hello", "general")).resolves.toEqual({
      delivered: false,
      error: "no webhook configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the message body and mapped channel to the webhook", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/T/TOKEN";
    const calls: { url: string; body: unknown }[] = [];
    globalThis.fetch = (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return { ok: true, status: 200, text: async () => "ok" } as Response;
    }) as typeof fetch;

    await expect(relayToSlack("📍 **Clocked on** at J-1043", "field-updates")).resolves.toEqual({
      delivered: true,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://hooks.slack.com/services/T/TOKEN");
    expect(calls[0].body).toEqual({
      text: "📍 **Clocked on** at J-1043",
      channel: "#field-updates",
    });
  });

  it("omits the channel override for DM channels", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/T/TOKEN";
    const bodies: unknown[] = [];
    globalThis.fetch = (async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return { ok: true, status: 200, text: async () => "ok" } as Response;
    }) as typeof fetch;

    await relayToSlack("hey", "dm-sarah");
    expect(bodies).toEqual([{ text: "hey" }]);
  });

  it("reports a failure when the webhook responds non-2xx", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/T/TOKEN";
    globalThis.fetch = (async () => {
      return { ok: false, status: 503, text: async () => "unavailable" } as Response;
    }) as typeof fetch;

    await expect(relayToSlack("hello", "general")).resolves.toEqual({
      delivered: false,
      error: "Slack webhook failed (503)",
    });
  });

  it("swallows network errors into a result instead of throwing", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/T/TOKEN";
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;

    await expect(relayToSlack("hello", "general")).resolves.toEqual({
      delivered: false,
      error: "network down",
    });
  });
});
