import { timingSafeEqual, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "@plumbtrack/database";
import { requireRole } from "../lib/auth";
import { recordAuditEvent } from "../lib/audit";
import { getOrgId, sendMissingOrg } from "../lib/tenant";
import { parseBody, sendValidationError } from "../lib/validation";
import { z } from "zod";
import {
  exchangeSlackCode,
  isSlackOAuthConfigured,
  slackAuthorizeUrl,
  slackChannelHistory,
  slackListChannels,
} from "../lib/slackApi";

/**
 * Slack workspace integration surface (design §4.6).
 *
 * FieldLoop has NO native Message entity — the messages are Slack's, read
 * through Slack's own API. This module owns the two integration entities:
 *
 *   SlackWorkspace    { orgId, teamId, accessToken, connectedAt }
 *   SlackChannelRoute { workspaceId, eventType, channelId }
 *
 * The access token is written here and never leaves the server: no response
 * in this module ever includes it. Connect paths:
 *  - OAuth: GET /oauth/url → Slack authorize → GET /oauth/callback (the
 *    redirect URI) exchanges the code via oauth.v2.access. 503 until
 *    SLACK_CLIENT_ID/SLACK_CLIENT_SECRET are configured — the connect
 *    button's honest "not wired yet" state.
 *  - Manual provision (admin/owner): POST /workspace with a bot token from
 *    an install performed outside the app. Same storage, same guarantees.
 */

/** Canonical automation event keys — mirrors SlackChannelRoute.eventType. */
const EVENT_TYPES = ["job.completed", "job.created_unassigned", "job.status_urgent"] as const;
type EventType = (typeof EVENT_TYPES)[number];

const connectSchema = z.object({
  teamId: z.string().trim().regex(/^T[A-Za-z0-9]+$/, "teamId must look like T012345ABC"),
  teamName: z.string().trim().max(120).optional(),
  accessToken: z.string().trim().min(10).max(400),
  botUserId: z.string().trim().max(64).optional(),
});

const routeSchema = z.object({
  channelId: z.string().trim().regex(/^[CGD][A-Za-z0-9]+$/, "channelId must be a Slack channel id"),
});

function oauthRedirectUri(request: { protocol: string; headers: Record<string, unknown> }): string {
  const host = String(request.headers.host ?? "");
  const proto = process.env.PUBLIC_API_BASE_URL?.trim() || `${request.protocol}://${host}`;
  return `${proto}/api/slack/oauth/callback`;
}

/** Timing-safe state check for the OAuth round-trip. */
function stateMatches(candidate: unknown, expected: string): boolean {
  if (typeof candidate !== "string") return false;
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function workspaceForOrg(orgId: string) {
  return prisma.slackWorkspace.findFirst({
    where: { orgId },
    include: { channelRoutes: { orderBy: { eventType: "asc" } } },
  });
}

export async function slackRoutes(app: FastifyInstance): Promise<void> {
  // ── Connection state (safe for any signed-in operator) ────────────────────
  app.get("/workspace", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const workspace = await workspaceForOrg(orgId);
    if (!workspace) return { connected: false, oauthConfigured: isSlackOAuthConfigured() };
    return {
      connected: true,
      teamId: workspace.teamId,
      teamName: workspace.teamName,
      connectedAt: workspace.connectedAt,
      botUserId: workspace.botUserId,
      oauthConfigured: isSlackOAuthConfigured(),
      // NOTE: accessToken is deliberately absent — server-side only (§4.6).
      routes: workspace.channelRoutes.map(route => ({
        eventType: route.eventType,
        channelId: route.channelId,
      })),
    };
  });

  // ── OAuth connect ─────────────────────────────────────────────────────────
  app.get("/oauth/url", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, ["manager", "admin", "owner"]);
    if (roleFailure) return roleFailure;
    if (!isSlackOAuthConfigured()) {
      return reply.code(503).send({
        message: "Slack OAuth is not configured on this deployment — set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET, or connect by provisioning a bot token directly.",
      });
    }
    const state = randomBytes(16).toString("hex");
    reply.setCookie("slack_oauth_state", state, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 600,
      secure: process.env.NODE_ENV === "production",
    });
    return { url: slackAuthorizeUrl(oauthRedirectUri(request), state) };
  });

  app.get("/oauth/callback", async (request, reply) => {
    const orgId = getOrgId(request);
    const query = request.query as { code?: string; state?: string; error?: string };
    if (query.error || !query.code || !query.state) {
      return reply.code(400).send({ message: "Slack OAuth handshake failed or was cancelled" });
    }
    if (!orgId) return sendMissingOrg(reply);
    const expectedState = request.cookies?.slack_oauth_state;
    if (!expectedState || !stateMatches(query.state, expectedState)) {
      return reply.code(403).send({ message: "Slack OAuth state mismatch — restart the connect flow" });
    }
    reply.clearCookie("slack_oauth_state", { path: "/" });

    const exchange = await exchangeSlackCode(query.code, oauthRedirectUri(request));
    if (!exchange.ok || !exchange.data?.access_token || !exchange.data.team?.id) {
      return reply.code(502).send({ message: `Slack OAuth exchange failed: ${exchange.error ?? "unknown error"}` });
    }
    const workspace = await prisma.slackWorkspace.upsert({
      where: { teamId: exchange.data.team.id },
      create: {
        orgId,
        teamId: exchange.data.team.id,
        teamName: exchange.data.team.name ?? null,
        accessToken: exchange.data.access_token,
        botUserId: exchange.data.bot_user_id ?? null,
      },
      update: { orgId, accessToken: exchange.data.access_token, botUserId: exchange.data.bot_user_id ?? null },
    });
    recordAuditEvent(request, {
      action: "slack.workspace.connected",
      entityType: "slack_workspace",
      entityId: workspace.id,
      metadata: { teamId: workspace.teamId, via: "oauth" },
    });
    return { connected: true, teamId: workspace.teamId };
  });

  // ── Manual provision / disconnect (admin+) ────────────────────────────────
  app.post("/workspace", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, ["admin", "owner"]);
    if (roleFailure) return roleFailure;
    const parsed = parseBody(connectSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const workspace = await prisma.slackWorkspace.upsert({
      where: { teamId: parsed.data.teamId },
      create: {
        orgId,
        teamId: parsed.data.teamId,
        teamName: parsed.data.teamName ?? null,
        accessToken: parsed.data.accessToken,
        botUserId: parsed.data.botUserId ?? null,
      },
      update: { orgId, accessToken: parsed.data.accessToken, teamName: parsed.data.teamName ?? null, botUserId: parsed.data.botUserId ?? null },
    });
    recordAuditEvent(request, {
      action: "slack.workspace.connected",
      entityType: "slack_workspace",
      entityId: workspace.id,
      metadata: { teamId: workspace.teamId, via: "manual" },
    });
    return { connected: true, teamId: workspace.teamId };
  });

  app.delete("/workspace", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, ["admin", "owner"]);
    if (roleFailure) return roleFailure;
    // Cascade removes the org's channel routes with the workspace.
    const deleted = await prisma.slackWorkspace.deleteMany({ where: { orgId } });
    recordAuditEvent(request, {
      action: "slack.workspace.disconnected",
      entityType: "slack_workspace",
      entityId: orgId,
      metadata: { count: deleted.count },
    });
    return reply.code(204).send();
  });

  // ── Automation routing (manager+) ─────────────────────────────────────────
  app.get("/routes", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const workspace = await workspaceForOrg(orgId);
    return {
      eventTypes: EVENT_TYPES,
      routes: (workspace?.channelRoutes ?? []).map(route => ({ eventType: route.eventType, channelId: route.channelId })),
    };
  });

  app.put("/routes/:eventType", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, ["manager", "admin", "owner"]);
    if (roleFailure) return roleFailure;
    const { eventType } = request.params as { eventType: string };
    if (!EVENT_TYPES.includes(eventType as EventType)) {
      return reply.code(404).send({ message: `Unknown event type — one of: ${EVENT_TYPES.join(", ")}` });
    }
    const parsed = parseBody(routeSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const workspace = await workspaceForOrg(orgId);
    if (!workspace) return reply.code(409).send({ message: "Connect a Slack workspace before setting routes" });
    await prisma.slackChannelRoute.upsert({
      where: { workspaceId_eventType: { workspaceId: workspace.id, eventType } },
      create: { workspaceId: workspace.id, eventType, channelId: parsed.data.channelId },
      update: { channelId: parsed.data.channelId },
    });
    recordAuditEvent(request, {
      action: "slack.route.updated",
      entityType: "slack_channel_route",
      entityId: `${workspace.id}:${eventType}`,
      metadata: { channelId: parsed.data.channelId },
    });
    return { eventType, channelId: parsed.data.channelId };
  });

  app.delete("/routes/:eventType", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, ["manager", "admin", "owner"]);
    if (roleFailure) return roleFailure;
    const { eventType } = request.params as { eventType: string };
    const workspace = await workspaceForOrg(orgId);
    if (!workspace) return reply.code(409).send({ message: "No connected Slack workspace" });
    await prisma.slackChannelRoute.deleteMany({ where: { workspaceId: workspace.id, eventType } });
    return reply.code(204).send();
  });

  // ── Slack reads (the messages live in Slack — proxy, never store) ─────────
  app.get("/channels", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const workspace = await workspaceForOrg(orgId);
    if (!workspace) return reply.code(409).send({ message: "No connected Slack workspace" });
    const result = await slackListChannels(workspace.accessToken);
    if (!result.ok) return reply.code(502).send({ message: result.error ?? "conversations.list failed" });
    return { channels: result.data?.channels ?? [] };
  });

  app.get("/channels/:channelId/messages", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const workspace = await workspaceForOrg(orgId);
    if (!workspace) return reply.code(409).send({ message: "No connected Slack workspace" });
    const { channelId } = request.params as { channelId: string };
    // Channel must be one the bot can see — the API call itself enforces that;
    // the id format check stops obvious junk before it travels.
    if (!/^[CGD][A-Za-z0-9]+$/.test(channelId)) {
      return reply.code(400).send({ message: "Invalid channel id" });
    }
    const result = await slackChannelHistory(workspace.accessToken, channelId);
    if (!result.ok) return reply.code(502).send({ message: result.error ?? "conversations.history failed" });
    return { messages: result.data?.messages ?? [] };
  });
}
