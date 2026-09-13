import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * Slack read gating — these GETs proxy the org's Slack workspace (channel
 * list, message history, workspace detail). Before the gate they were
 * reachable by ANY authenticated session, including a technician token
 * minted from the public device bootstrap secret. Office roles only.
 */

const { slackWorkspaceFindFirst, slackListChannels, slackChannelHistory } = vi.hoisted(() => ({
  slackWorkspaceFindFirst: vi.fn(),
  slackListChannels: vi.fn(),
  slackChannelHistory: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    slackWorkspace: { findFirst: slackWorkspaceFindFirst },
  },
}));

vi.mock("../src/lib/slackApi", () => ({
  exchangeSlackCode: vi.fn(),
  isSlackOAuthConfigured: vi.fn(() => false),
  slackAuthorizeUrl: vi.fn(),
  slackChannelHistory,
  slackListChannels,
}));

import { buildApp } from "../src/server";
import { issueAuthToken, type OrganizationRole } from "../src/lib/auth";

const ORG = "org-slack-access";

function bearer(role: OrganizationRole): string {
  return `Bearer ${issueAuthToken({ userId: "user-1", organizationId: ORG, role })}`;
}

describe("Slack read endpoints require office roles", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    vi.clearAllMocks();
    slackWorkspaceFindFirst.mockResolvedValue({
      id: "ws-1",
      orgId: ORG,
      teamId: "T0123",
      teamName: "Caulfield Plumbing",
      connectedAt: new Date(),
      botUserId: "U0BOT",
      accessToken: "xoxb-redacted",
      channelRoutes: [],
    });
    slackListChannels.mockResolvedValue({ ok: true, data: { channels: [] } });
    slackChannelHistory.mockResolvedValue({ ok: true, data: { messages: [] } });
  });

  it.each(["/api/slack/workspace", "/api/slack/routes", "/api/slack/channels", "/api/slack/channels/C0123/messages"])(
    "forbids a technician session on GET %s",
    async (url) => {
      const response = await app.inject({ method: "GET", url, headers: { authorization: bearer("technician") } });
      expect(response.statusCode).toBe(403);
      expect(slackListChannels).not.toHaveBeenCalled();
      expect(slackChannelHistory).not.toHaveBeenCalled();
    },
  );

  it.each(["/api/slack/workspace", "/api/slack/routes", "/api/slack/channels", "/api/slack/channels/C0123/messages"])(
    "serves an office session on GET %s",
    async (url) => {
      const response = await app.inject({ method: "GET", url, headers: { authorization: bearer("dispatcher") } });
      expect(response.statusCode).toBe(200);
    },
  );

  it("never leaks the workspace access token in the workspace response", async () => {
    const response = await app.inject({ method: "GET", url: "/api/slack/workspace", headers: { authorization: bearer("manager") } });
    expect(response.statusCode).toBe(200);
    expect(JSON.stringify(response.json())).not.toContain("xoxb-redacted");
  });
});
