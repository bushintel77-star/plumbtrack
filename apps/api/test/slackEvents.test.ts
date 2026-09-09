import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";

const { updateMany, workspaceFindUnique } = vi.hoisted(() => ({
  updateMany: vi.fn(),
  workspaceFindUnique: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    job: { updateMany },
    slackWorkspace: { findUnique: workspaceFindUnique },
  },
}));

import { buildApp } from "../src/server";

const TOKEN = "slack-verification-token";
const ORG = "org_slack_test";

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
    delete process.env.SLACK_SIGNING_SECRET;
    delete process.env.SLACK_ORG_ID;
    delete process.env.SLACK_TEAM_ID;
  });

  function form(payload: Record<string, string>): { headers: Record<string, string>; payload: string } {
    return {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams(payload).toString(),
    };
  }

  it("is disabled (503) until a signing secret or verification token is configured", async () => {
    const response = await app.inject({ method: "POST", url: "/api/slack/events", payload: {} });
    expect(response.statusCode).toBe(503);
  });

  it("reports enabled status and the active verification mode on the health probe", async () => {
    process.env.SLACK_VERIFICATION_TOKEN = TOKEN;
    const legacy = await app.inject({ method: "GET", url: "/api/slack/status" });
    expect(legacy.json()).toMatchObject({ enabled: true, signatureVerification: "legacy-token" });

    process.env.SLACK_SIGNING_SECRET = "sig-secret";
    const hmac = await app.inject({ method: "GET", url: "/api/slack/status" });
    expect(hmac.json()).toMatchObject({ enabled: true, signatureVerification: "hmac-v0" });

    delete process.env.SLACK_SIGNING_SECRET;
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

  describe("HMAC v0 signature verification (SLACK_SIGNING_SECRET)", () => {
    const SECRET = "test-signing-secret";

    function signedHeaders(rawBody: string, timestampSeconds = Math.floor(Date.now() / 1000), contentType = "application/json"): Record<string, string> {
      const signature = "v0=" + createHmac("sha256", SECRET).update(`v0:${timestampSeconds}:${rawBody}`).digest("hex");
      return {
        "content-type": contentType,
        "x-slack-request-timestamp": String(timestampSeconds),
        "x-slack-signature": signature,
      };
    }

    it("accepts a correctly signed JSON payload without a legacy token", async () => {
      process.env.SLACK_SIGNING_SECRET = SECRET;
      const rawBody = JSON.stringify({ type: "url_verification", challenge: "signed-echo" });
      const response = await app.inject({
        method: "POST",
        url: "/api/slack/events",
        headers: signedHeaders(rawBody),
        payload: rawBody,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ challenge: "signed-echo" });
    });

    it("rejects a signature computed over a tampered body (401)", async () => {
      process.env.SLACK_SIGNING_SECRET = SECRET;
      const rawBody = JSON.stringify({ type: "url_verification", challenge: "signed-echo" });
      const response = await app.inject({
        method: "POST",
        url: "/api/slack/events",
        headers: signedHeaders(rawBody),
        payload: rawBody.replace("signed-echo", "tampered-echo"),
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().error).toMatch(/signature mismatch/);
    });

    it("rejects a stale timestamp (replay window, 401)", async () => {
      process.env.SLACK_SIGNING_SECRET = SECRET;
      const rawBody = JSON.stringify({ type: "url_verification", challenge: "late" });
      const stale = Math.floor(Date.now() / 1000) - 60 * 10;
      const response = await app.inject({
        method: "POST",
        url: "/api/slack/events",
        headers: signedHeaders(rawBody, stale),
        payload: rawBody,
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().error).toMatch(/stale timestamp/);
    });

    it("mutates with a signed urlencoded interactivity payload and resolves the org", async () => {
      process.env.SLACK_SIGNING_SECRET = SECRET;
      workspaceFindUnique.mockResolvedValue({ orgId: ORG });
      updateMany.mockResolvedValue({ count: 1 });
      const inner = JSON.stringify({
        user: { name: "sarah" },
        team: { id: "T1" },
        actions: [{ action_id: "accept_job_J-42" }],
      });
      const rawBody = new URLSearchParams({ payload: inner }).toString();
      const response = await app.inject({
        method: "POST",
        url: "/api/slack/events",
        headers: signedHeaders(rawBody, Math.floor(Date.now() / 1000), "application/x-www-form-urlencoded"),
        payload: rawBody,
      });
      expect(response.statusCode).toBe(200);
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "J-42", status: "scheduled", orgId: ORG },
          data: { status: "in_progress" },
        }),
      );
    });
  });

  it("updates job status via /dispatch-status with friendly aliases (org-scoped)", async () => {
    process.env.SLACK_VERIFICATION_TOKEN = TOKEN;
    workspaceFindUnique.mockResolvedValue({ orgId: ORG });
    updateMany.mockResolvedValue({ count: 1 });

    const response = await app.inject({
      method: "POST",
      url: "/api/slack/events",
      ...form({ command: "/dispatch-status", token: TOKEN, team_id: "T1", text: "J-42 en_route" }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ response_type: "in_channel", text: "✓ Job J-42 → in_progress" });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "J-42", orgId: ORG }, data: { status: "in_progress" } }),
    );
  });

  it("refuses to mutate when the team cannot be mapped to an org (fail-closed)", async () => {
    process.env.SLACK_VERIFICATION_TOKEN = TOKEN;
    workspaceFindUnique.mockResolvedValue(null);

    const response = await app.inject({
      method: "POST",
      url: "/api/slack/events",
      ...form({ command: "/dispatch-status", token: TOKEN, team_id: "T1", text: "J-42 completed" }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ response_type: "ephemeral" });
    expect(response.json().text).toMatch(/not linked to an organization/i);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("rejects a foreign team with 403 before any data is touched", async () => {
    process.env.SLACK_VERIFICATION_TOKEN = TOKEN;
    process.env.SLACK_ORG_ID = ORG;
    process.env.SLACK_TEAM_ID = "T-expected";
    workspaceFindUnique.mockResolvedValue(null);

    const response = await app.inject({
      method: "POST",
      url: "/api/slack/events",
      ...form({ command: "/dispatch-status", token: TOKEN, team_id: "T-foreign", text: "J-42 completed" }),
    });

    expect(response.statusCode).toBe(403);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("answers ephemeral usage help for malformed /dispatch-status text", async () => {
    process.env.SLACK_VERIFICATION_TOKEN = TOKEN;
    workspaceFindUnique.mockResolvedValue({ orgId: ORG });
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
    workspaceFindUnique.mockResolvedValue({ orgId: ORG });
    updateMany.mockResolvedValue({ count: 0 });
    const response = await app.inject({
      method: "POST",
      url: "/api/slack/events",
      ...form({ command: "/dispatch-status", token: TOKEN, text: "nope completed" }),
    });
    expect(response.json()).toMatchObject({ response_type: "ephemeral" });
  });

  it("claims a job from an accept_job_{id} block action (org-scoped)", async () => {
    process.env.SLACK_VERIFICATION_TOKEN = TOKEN;
    workspaceFindUnique.mockResolvedValue({ orgId: ORG });
    updateMany.mockResolvedValue({ count: 1 });
    const payload = JSON.stringify({
      token: TOKEN,
      response_url: "https://hooks.slack.com/actions/T1/B1/xyz",
      team: { id: "T1" },
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
        where: { id: "J-42", status: "scheduled", orgId: ORG },
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
