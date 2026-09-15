import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";

/**
 * Route-level wiring of the job-thread bridge: a signed Events API callback
 * carrying a reply in a job's Slack thread lands on the job, scoped to the
 * org the verified team maps to.
 */

const mocks = vi.hoisted(() => ({
  workspaceFindUnique: vi.fn(),
  threadFindUnique: vi.fn(),
  messageCreate: vi.fn(),
  publishToOrg: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    slackWorkspace: { findUnique: mocks.workspaceFindUnique },
    slackJobThread: { findUnique: mocks.threadFindUnique },
    jobMessage: { create: mocks.messageCreate },
  },
}));
vi.mock("../src/lib/liveBus", () => ({ publishToOrg: mocks.publishToOrg }));
vi.mock("../src/lib/slackApi", () => ({
  exchangeSlackCode: vi.fn(),
  isSlackOAuthConfigured: vi.fn(() => false),
  slackAuthorizeUrl: vi.fn(),
  slackChannelHistory: vi.fn(),
  slackListChannels: vi.fn(),
  slackPostMessage: vi.fn(),
  slackUserName: vi.fn(async () => "Dana"),
}));

import { buildApp } from "../src/server";

const SECRET = "thread-signing-secret";
const ORG = "org_thread_inbound";

function signed(rawBody: string): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    "content-type": "application/json",
    "x-slack-request-timestamp": String(timestamp),
    "x-slack-signature": "v0=" + createHmac("sha256", SECRET).update(`v0:${timestamp}:${rawBody}`).digest("hex"),
  };
}

const callback = (teamId: string) => JSON.stringify({
  type: "event_callback",
  team_id: teamId,
  event: {
    type: "message",
    channel: "C0DISPATCH",
    user: "U0DANA",
    text: "Customer's home after 2pm",
    ts: "1700000100.000200",
    thread_ts: "1700000000.000100",
  },
});

describe("POST /api/slack/events — job thread replies", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });
  afterAll(async () => app.close());
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.SLACK_SIGNING_SECRET;
  });

  it("writes the reply to the job for a mapped team", async () => {
    process.env.SLACK_SIGNING_SECRET = SECRET;
    mocks.workspaceFindUnique.mockResolvedValue({ orgId: ORG });
    mocks.threadFindUnique.mockResolvedValue({
      orgId: ORG,
      jobId: "J-1043",
      channelId: "C0DISPATCH",
      threadTs: "1700000000.000100",
      workspace: { id: "ws-1", accessToken: "xoxb", botUserId: "U0BOT" },
    });
    mocks.messageCreate.mockResolvedValue({ id: "m-1", sender: "Dana", body: "Customer's home after 2pm", createdAt: new Date() });

    const rawBody = callback("T0TEAM");
    const response = await app.inject({ method: "POST", url: "/api/slack/events", headers: signed(rawBody), payload: rawBody });

    expect(response.statusCode).toBe(200);
    expect(mocks.messageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ orgId: ORG, jobId: "J-1043", source: "slack", direction: "dispatch" }),
    });
    expect(mocks.publishToOrg).toHaveBeenCalled();
  });

  it("acks but writes nothing for a team that isn't linked to an org", async () => {
    process.env.SLACK_SIGNING_SECRET = SECRET;
    mocks.workspaceFindUnique.mockResolvedValue(null);

    const rawBody = callback("T0UNKNOWN");
    const response = await app.inject({ method: "POST", url: "/api/slack/events", headers: signed(rawBody), payload: rawBody });

    expect(response.statusCode).toBe(200);
    expect(mocks.threadFindUnique).not.toHaveBeenCalled();
    expect(mocks.messageCreate).not.toHaveBeenCalled();
  });

  it("rejects an unsigned callback before touching any job", async () => {
    process.env.SLACK_SIGNING_SECRET = SECRET;
    const rawBody = callback("T0TEAM");
    const response = await app.inject({
      method: "POST",
      url: "/api/slack/events",
      headers: { "content-type": "application/json" },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(401);
    expect(mocks.messageCreate).not.toHaveBeenCalled();
  });
});
