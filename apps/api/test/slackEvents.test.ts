import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const { updateMany } = vi.hoisted(() => ({
  updateMany: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    job: { updateMany },
  },
}));

import { buildApp } from "../src/server";

const TOKEN = "slack-verification-token";

describe("slack events endpoint (Events Mode inbound)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.SLACK_VERIFICATION_TOKEN;
  });

  function form(payload: Record<string, string>): { headers: Record<string, string>; payload: string } {
    return {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams(payload).toString(),
    };
  }

  it("is disabled (503) until SLACK_VERIFICATION_TOKEN is configured", async () => {
    const response = await app.inject({ method: "POST", url: "/api/slack/events", payload: {} });
    expect(response.statusCode).toBe(503);
  });

  it("reports enabled status on the health probe", async () => {
    process.env.SLACK_VERIFICATION_TOKEN = TOKEN;
    const enabled = await app.inject({ method: "GET", url: "/api/slack/status" });
    expect(enabled.statusCode).toBe(200);
    expect(enabled.json()).toMatchObject({ enabled: true });

    delete process.env.SLACK_VERIFICATION_TOKEN;
    const disabled = await app.inject({ method: "GET", url: "/api/slack/status" });
    expect(disabled.json()).toMatchObject({ enabled: false });
  });

  it("echoes the url_verification challenge", async () => {
    process.env.SLACK_VERIFICATION_TOKEN = TOKEN;
    const response = await app.inject({
      method: "POST",
      url: "/api/slack/events",
      payload: { type: "url_verification", token: TOKEN, challenge: "echo-me" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ challenge: "echo-me" });
  });

  it("rejects a wrong verification token (401)", async () => {
    process.env.SLACK_VERIFICATION_TOKEN = TOKEN;
    const response = await app.inject({
      method: "POST",
      url: "/api/slack/events",
      payload: { type: "url_verification", token: "wrong", challenge: "x" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("updates job status via /dispatch-status with friendly aliases", async () => {
    process.env.SLACK_VERIFICATION_TOKEN = TOKEN;
    updateMany.mockResolvedValue({ count: 1 });

    const response = await app.inject({
      method: "POST",
      url: "/api/slack/events",
      ...form({ command: "/dispatch-status", token: TOKEN, text: "J-42 en_route" }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ response_type: "in_channel", text: "✓ Job J-42 → in_progress" });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "J-42" }, data: { status: "in_progress" } }),
    );
  });

  it("answers ephemeral usage help for malformed /dispatch-status text", async () => {
    process.env.SLACK_VERIFICATION_TOKEN = TOKEN;
    const response = await app.inject({
      method: "POST",
      url: "/api/slack/events",
      ...form({ command: "/dispatch-status", token: TOKEN, text: "" }),
    });
    expect(response.json()).toMatchObject({ response_type: "ephemeral" });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("answers ephemeral for an unknown job id", async () => {
    process.env.SLACK_VERIFICATION_TOKEN = TOKEN;
    updateMany.mockResolvedValue({ count: 0 });
    const response = await app.inject({
      method: "POST",
      url: "/api/slack/events",
      ...form({ command: "/dispatch-status", token: TOKEN, text: "nope completed" }),
    });
    expect(response.json()).toMatchObject({ response_type: "ephemeral" });
  });

  it("claims a job from an accept_job_{id} block action", async () => {
    process.env.SLACK_VERIFICATION_TOKEN = TOKEN;
    updateMany.mockResolvedValue({ count: 1 });
    const payload = JSON.stringify({
      token: TOKEN,
      response_url: "https://hooks.slack.com/actions/T1/B1/xyz",
      user: { name: "sarah" },
      actions: [{ action_id: "accept_job_J-42" }],
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/slack/events",
      ...form({ payload }),
    });

    expect(response.statusCode).toBe(200);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "J-42", status: "scheduled" },
        data: { status: "in_progress" },
      }),
    );
  });

  it("acks event callbacks without touching the database", async () => {
    process.env.SLACK_VERIFICATION_TOKEN = TOKEN;
    const response = await app.inject({
      method: "POST",
      url: "/api/slack/events",
      payload: { type: "event_callback", token: TOKEN, event: { type: "message" } },
    });
    expect(response.statusCode).toBe(200);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
