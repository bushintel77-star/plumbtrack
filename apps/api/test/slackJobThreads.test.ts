import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  threadFindUnique: vi.fn(),
  threadCreate: vi.fn(),
  routeFindUnique: vi.fn(),
  messageCreate: vi.fn(),
  workspaceFindFirst: vi.fn(),
  slackPostMessage: vi.fn(),
  slackUserName: vi.fn(),
  publishToOrg: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    slackJobThread: { findUnique: mocks.threadFindUnique, create: mocks.threadCreate },
    slackChannelRoute: { findUnique: mocks.routeFindUnique },
    jobMessage: { create: mocks.messageCreate },
    slackWorkspace: { findFirst: mocks.workspaceFindFirst },
  },
}));
vi.mock("../src/lib/slackApi", () => ({ slackPostMessage: mocks.slackPostMessage, slackUserName: mocks.slackUserName }));
vi.mock("../src/lib/liveBus", () => ({ publishToOrg: mocks.publishToOrg }));

import {
  bridgeSlackThreadReply,
  clearSlackNameCache,
  deliverToJobThread,
  jobThreadBridgeStatus,
} from "../src/lib/slackJobThreads";

const ORG = "org-bridge";
const WORKSPACE = { id: "ws-1", accessToken: "xoxb-test" };
const JOB_THREAD = { jobId: "J-1043", headerText: "Job J-1043 · Cho — 9 Booran Rd" };

const THREAD = {
  id: "thr-1",
  orgId: ORG,
  jobId: "J-1043",
  workspaceId: "ws-1",
  channelId: "C0DISPATCH",
  threadTs: "1700000000.000100",
  workspace: { id: "ws-1", accessToken: "xoxb-test", botUserId: "U0BOT" },
};

function reply(overrides: Record<string, unknown> = {}) {
  return {
    type: "message",
    channel: "C0DISPATCH",
    user: "U0DANA",
    text: "Customer rang — gate code changed to 4411",
    ts: "1700000100.000200",
    thread_ts: "1700000000.000100",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearSlackNameCache();
});

describe("deliverToJobThread (outbound)", () => {
  it("posts the thread parent into the routed channel on a job's first message, then replies in it", async () => {
    mocks.threadFindUnique.mockResolvedValue(null);
    mocks.routeFindUnique.mockResolvedValue({ channelId: "C0DISPATCH" });
    mocks.slackPostMessage
      .mockResolvedValueOnce({ ok: true, data: { ts: "1700000000.000100", channel: "C0DISPATCH" } })
      .mockResolvedValueOnce({ ok: true, data: { ts: "1700000000.000200" } });
    mocks.threadCreate.mockResolvedValue(THREAD);

    const result = await deliverToJobThread(ORG, WORKSPACE, { text: "*Dave* · field\nRunning 10 min late", jobThread: JOB_THREAD });

    expect(result).toEqual({ delivered: true, retryable: false, providerMessageId: "1700000000.000200" });
    expect(mocks.slackPostMessage).toHaveBeenNthCalledWith(1, "xoxb-test", { channel: "C0DISPATCH", text: JOB_THREAD.headerText });
    expect(mocks.threadCreate).toHaveBeenCalledWith({
      data: { orgId: ORG, jobId: "J-1043", workspaceId: "ws-1", channelId: "C0DISPATCH", threadTs: "1700000000.000100" },
    });
    expect(mocks.slackPostMessage).toHaveBeenNthCalledWith(2, "xoxb-test", {
      channel: "C0DISPATCH",
      text: "*Dave* · field\nRunning 10 min late",
      thread_ts: "1700000000.000100",
    });
  });

  it("replies straight into an existing thread", async () => {
    mocks.threadFindUnique.mockResolvedValue(THREAD);
    mocks.slackPostMessage.mockResolvedValue({ ok: true, data: { ts: "1700000000.000300" } });

    const result = await deliverToJobThread(ORG, WORKSPACE, { text: "hi", jobThread: JOB_THREAD });

    expect(result.delivered).toBe(true);
    expect(mocks.routeFindUnique).not.toHaveBeenCalled();
    expect(mocks.slackPostMessage).toHaveBeenCalledTimes(1);
    expect(mocks.slackPostMessage).toHaveBeenCalledWith("xoxb-test", expect.objectContaining({ thread_ts: THREAD.threadTs }));
  });

  it("is a terminal failure when no channel is routed for job messages", async () => {
    mocks.threadFindUnique.mockResolvedValue(null);
    mocks.routeFindUnique.mockResolvedValue(null);

    const result = await deliverToJobThread(ORG, WORKSPACE, { text: "hi", jobThread: JOB_THREAD });

    expect(result).toMatchObject({ delivered: false, retryable: false });
    expect(mocks.slackPostMessage).not.toHaveBeenCalled();
  });

  it("dead-letters Slack errors that can't succeed on retry, retries throttling and outages", async () => {
    mocks.threadFindUnique.mockResolvedValue(THREAD);
    mocks.slackPostMessage.mockResolvedValueOnce({ ok: false, error: "channel_not_found" });
    expect(await deliverToJobThread(ORG, WORKSPACE, { text: "hi", jobThread: JOB_THREAD })).toMatchObject({ retryable: false });

    mocks.slackPostMessage.mockResolvedValueOnce({ ok: false, httpStatus: 503, error: "Slack API chat.postMessage failed (503)" });
    expect(await deliverToJobThread(ORG, WORKSPACE, { text: "hi", jobThread: JOB_THREAD })).toMatchObject({ retryable: true });

    mocks.slackPostMessage.mockResolvedValueOnce({ ok: false, httpStatus: 429, error: "Slack API chat.postMessage failed (429)" });
    expect(await deliverToJobThread(ORG, WORKSPACE, { text: "hi", jobThread: JOB_THREAD })).toMatchObject({ retryable: true });
  });

  it("reuses the winning thread when two first messages race", async () => {
    mocks.threadFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(THREAD);
    mocks.routeFindUnique.mockResolvedValue({ channelId: "C0DISPATCH" });
    mocks.slackPostMessage
      .mockResolvedValueOnce({ ok: true, data: { ts: "1700000000.999999", channel: "C0DISPATCH" } })
      .mockResolvedValueOnce({ ok: true, data: { ts: "1700000001.000000" } });
    mocks.threadCreate.mockRejectedValue({ code: "P2002" });

    const result = await deliverToJobThread(ORG, WORKSPACE, { text: "hi", jobThread: JOB_THREAD });

    expect(result.delivered).toBe(true);
    expect(mocks.slackPostMessage).toHaveBeenLastCalledWith("xoxb-test", expect.objectContaining({ thread_ts: THREAD.threadTs }));
  });
});

describe("bridgeSlackThreadReply (inbound)", () => {
  it("writes a human thread reply to the job as a dispatch message and publishes it live", async () => {
    mocks.threadFindUnique.mockResolvedValue(THREAD);
    mocks.slackUserName.mockResolvedValue("Dana Whitlock");
    mocks.messageCreate.mockResolvedValue({
      id: "m-9",
      sender: "Dana Whitlock",
      body: "Customer rang — gate code changed to 4411",
      createdAt: new Date("2026-09-16T01:00:00.000Z"),
    });

    await expect(bridgeSlackThreadReply(ORG, reply())).resolves.toBe("bridged");

    expect(mocks.threadFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { channelId_threadTs: { channelId: "C0DISPATCH", threadTs: "1700000000.000100" } },
    }));
    expect(mocks.messageCreate).toHaveBeenCalledWith({
      data: {
        orgId: ORG,
        jobId: "J-1043",
        direction: "dispatch",
        sender: "Dana Whitlock",
        body: "Customer rang — gate code changed to 4411",
        source: "slack",
        slackTs: "1700000100.000200",
      },
    });
    expect(mocks.publishToOrg).toHaveBeenCalledWith(expect.objectContaining({
      topic: "topic/jobs/message",
      orgId: ORG,
      jobId: "J-1043",
      message: expect.objectContaining({ id: "m-9", source: "slack", direction: "dispatch" }),
    }));
  });

  it("attributes the reply to 'Slack' when the author can't be resolved", async () => {
    mocks.threadFindUnique.mockResolvedValue(THREAD);
    mocks.slackUserName.mockResolvedValue(null);
    mocks.messageCreate.mockResolvedValue({ id: "m-10", sender: "Slack", body: "x", createdAt: new Date() });

    await bridgeSlackThreadReply(ORG, reply());

    expect(mocks.messageCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ sender: "Slack" }) });
  });

  it.each([
    ["an unmapped team (no org)", null, reply()],
    ["a top-level channel post", ORG, reply({ thread_ts: undefined })],
    ["the thread parent itself", ORG, reply({ ts: "1700000000.000100" })],
    ["an edit", ORG, reply({ subtype: "message_changed" })],
    ["a bot post", ORG, reply({ bot_id: "B0123" })],
    ["a non-message event", ORG, reply({ type: "reaction_added" })],
    ["an empty reply", ORG, reply({ text: "   " })],
  ])("ignores %s without writing", async (_label, orgId, event) => {
    mocks.threadFindUnique.mockResolvedValue(THREAD);

    await expect(bridgeSlackThreadReply(orgId as string | null, event)).resolves.toBe("ignored");
    expect(mocks.messageCreate).not.toHaveBeenCalled();
  });

  it("ignores our own bot user, unknown threads, and threads that belong to another org", async () => {
    mocks.threadFindUnique.mockResolvedValueOnce(THREAD);
    await expect(bridgeSlackThreadReply(ORG, reply({ user: "U0BOT" }))).resolves.toBe("ignored");

    mocks.threadFindUnique.mockResolvedValueOnce(null);
    await expect(bridgeSlackThreadReply(ORG, reply())).resolves.toBe("ignored");

    mocks.threadFindUnique.mockResolvedValueOnce({ ...THREAD, orgId: "org-other" });
    await expect(bridgeSlackThreadReply(ORG, reply())).resolves.toBe("ignored");

    expect(mocks.messageCreate).not.toHaveBeenCalled();
  });

  it("treats Slack re-delivering the same event as a no-op", async () => {
    mocks.threadFindUnique.mockResolvedValue(THREAD);
    mocks.slackUserName.mockResolvedValue("Dana");
    mocks.messageCreate.mockRejectedValue({ code: "P2002" });

    await expect(bridgeSlackThreadReply(ORG, reply())).resolves.toBe("duplicate");
    expect(mocks.publishToOrg).not.toHaveBeenCalled();
  });
});

describe("jobThreadBridgeStatus", () => {
  it("reports the bridge off without a workspace, connected-but-unrouted, and linked", async () => {
    mocks.workspaceFindFirst.mockResolvedValueOnce(null);
    await expect(jobThreadBridgeStatus(ORG)).resolves.toEqual({ connected: false, linked: false });

    mocks.workspaceFindFirst.mockResolvedValueOnce({ id: "ws-1", channelRoutes: [] });
    await expect(jobThreadBridgeStatus(ORG)).resolves.toEqual({ connected: true, linked: false });

    mocks.workspaceFindFirst.mockResolvedValueOnce({ id: "ws-1", channelRoutes: [{ channelId: "C0DISPATCH" }] });
    await expect(jobThreadBridgeStatus(ORG)).resolves.toEqual({ connected: true, linked: true });
  });

  it("reports the bridge off when the store can't answer", async () => {
    mocks.workspaceFindFirst.mockRejectedValue(new Error("relation does not exist"));
    await expect(jobThreadBridgeStatus(ORG)).resolves.toEqual({ connected: false, linked: false });
  });
});
