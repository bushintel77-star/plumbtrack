import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "@plumbtrack/database";
import { requireRole } from "../lib/auth";
import { recordAuditEvent } from "../lib/audit";
import { getOrgId, sendMissingOrg } from "../lib/tenant";
import { parseBody, sendValidationError } from "../lib/validation";
import { encryptionConfigured, encryptSecret, decryptSecret, secretHint } from "../lib/secrets";
import { buildAuthorizeUrl, codeChallengeFor, createCodeVerifier, createState, exchangeCodeForTokens } from "../lib/pkce";
import {
  authorizeUrlFor,
  clientCredentialsFor,
  findProvider,
  INTEGRATION_PROVIDERS,
  providerAvailable,
  providerUnavailableReason,
  tokenUrlFor,
  type IntegrationProvider,
} from "../integrations/catalog";
import { verificationAvailable, verifyCredentials } from "../integrations/verify";

/**
 * Integration connections for the setup wizard and the integrations page.
 *
 * Two ways in, both finishing server-side:
 *  - OAuth 2.0 authorization code with PKCE (S256). The code verifier is
 *    created here, stored encrypted against a single-use state row, and never
 *    sent to the browser.
 *  - API keys the operator pastes, checked against the provider before they
 *    are stored, then encrypted at rest.
 *
 * No response in this module ever contains a credential.
 */

const WRITE_ROLES = ["admin", "owner"] as const;
const READ_ROLES = ["dispatcher", "manager", "accountant", "admin", "owner"] as const;
const AUTHORIZATION_TTL_MS = 10 * 60_000;

const credentialsSchema = z.object({
  fields: z.record(z.string().trim().min(1).max(400)),
});

const interestSchema = z.object({
  note: z.string().trim().max(400).optional(),
});

function callbackUrl(provider: string): string {
  const base = process.env.PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, "");
  return `${base ?? "http://localhost:8080"}/api/integrations/oauth/callback/${provider}`;
}

function hqBase(): string {
  return process.env.HQ_APP_URL?.trim().replace(/\/+$/, "") || "http://localhost:3001";
}

/** Where the operator lands after the provider's round trip. `returnTo` may
 *  already carry its own query (e.g. `/?module=setup`) — merge rather than
 *  concatenate, or a second `?` would corrupt the URL. */
function finishRedirect(reply: FastifyReply, returnTo: string | null, provider: string, outcome: "connected" | "denied" | "failed"): FastifyReply {
  const path = returnTo && returnTo.startsWith("/") ? returnTo : "/";
  const url = new URL(path, hqBase());
  url.searchParams.set("provider", provider);
  url.searchParams.set("connection", outcome);
  return reply.code(302).redirect(url.toString());
}

interface ConnectionRow {
  provider: string;
  status: string;
  authType: string;
  accountLabel: string | null;
  connectedAt: Date;
  lastError: string | null;
  settings: unknown;
}

function toCard(provider: IntegrationProvider, connection: ConnectionRow | undefined, interested: boolean) {
  const available = providerAvailable(provider);
  return {
    id: provider.id,
    name: provider.name,
    category: provider.category,
    blurb: provider.blurb,
    syncs: provider.syncs,
    authType: provider.authType,
    steps: provider.steps,
    fields: provider.fields ?? [],
    docsUrl: provider.docsUrl ?? null,
    minutes: provider.minutes ?? null,
    canTestConnection: verificationAvailable(provider.id),
    available,
    unavailableReason: providerUnavailableReason(provider),
    interestRegistered: interested,
    status: connection?.status ?? (available ? "not_connected" : "unavailable"),
    accountLabel: connection?.accountLabel ?? null,
    connectedAt: connection?.connectedAt?.toISOString() ?? null,
    lastError: connection?.lastError ?? null,
  };
}

export async function connectionRoutes(app: FastifyInstance): Promise<void> {
  /** Catalog + this org's live status, in one call for the wizard. */
  app.get("/", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, READ_ROLES);
    if (roleFailure) return roleFailure;
    const [connections, interests, slackWorkspace] = await Promise.all([
      prisma.integrationConnection.findMany({ where: { orgId } }),
      prisma.integrationInterest.findMany({ where: { orgId }, select: { provider: true } }),
      prisma.slackWorkspace.findFirst({ where: { orgId }, select: { teamName: true, connectedAt: true } }).catch(() => null),
    ]);
    const byProvider = new Map(connections.map(row => [row.provider, row as ConnectionRow]));
    // Slack connects through its own workspace flow; surface it in the same shape.
    if (slackWorkspace && !byProvider.has("slack")) {
      byProvider.set("slack", {
        provider: "slack",
        status: "connected",
        authType: "managed",
        accountLabel: slackWorkspace.teamName,
        connectedAt: slackWorkspace.connectedAt,
        lastError: null,
        settings: {},
      });
    }
    const interestedIds = new Set(interests.map(row => row.provider));
    return {
      credentialStorageReady: encryptionConfigured(),
      providers: INTEGRATION_PROVIDERS.map(provider => toCard(provider, byProvider.get(provider.id), interestedIds.has(provider.id))),
    };
  });

  /** Check a pasted key against the provider without storing anything. */
  app.post("/:provider/test", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, WRITE_ROLES);
    if (roleFailure) return roleFailure;
    const provider = findProvider((request.params as { provider: string }).provider);
    if (!provider || provider.authType !== "api_key") return reply.code(404).send({ message: "Unknown provider" });
    const parsed = parseBody(credentialsSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    const result = await verifyCredentials(provider.id, parsed.data.fields);
    if (!result.ok) return reply.code(400).send({ ok: false, message: result.error ?? "That didn't work." });
    return { ok: true, accountLabel: result.accountLabel ?? null, checked: verificationAvailable(provider.id) };
  });

  /** Store an API key (checked first, encrypted at rest). */
  app.post("/:provider/api-key", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, WRITE_ROLES);
    if (roleFailure) return roleFailure;
    const provider = findProvider((request.params as { provider: string }).provider);
    if (!provider || provider.authType !== "api_key") return reply.code(404).send({ message: "Unknown provider" });
    if (!encryptionConfigured()) {
      return reply.code(503).send({
        message: "This FieldLoop can't store credentials yet (APP_ENCRYPTION_KEY isn't set). Ask your administrator to add it — nothing was saved.",
      });
    }
    const parsed = parseBody(credentialsSchema, request.body);
    if (!parsed.ok) return sendValidationError(reply, parsed.error);

    // Required fields and their formats come from the catalog the UI renders,
    // so the checks the operator saw are the checks applied here.
    for (const field of provider.fields ?? []) {
      const value = parsed.data.fields[field.id];
      if (!value) return reply.code(400).send({ message: `${field.label} is needed.`, field: field.id });
      if (field.pattern && !new RegExp(field.pattern).test(value)) {
        return reply.code(400).send({ message: field.patternHint ?? `${field.label} doesn't look right.`, field: field.id });
      }
    }

    const verified = await verifyCredentials(provider.id, parsed.data.fields);
    if (!verified.ok) return reply.code(400).send({ message: verified.error ?? "The provider rejected those details." });

    const secretField = (provider.fields ?? []).find(field => field.secret);
    const nonSecret = Object.fromEntries(
      (provider.fields ?? []).filter(field => !field.secret).map(field => [field.id, parsed.data.fields[field.id]]),
    );
    const connection = await prisma.integrationConnection.upsert({
      where: { orgId_provider: { orgId, provider: provider.id } },
      create: {
        orgId,
        provider: provider.id,
        authType: "api_key",
        status: "connected",
        accountLabel: verified.accountLabel ?? provider.name,
        apiKeyEnc: encryptSecret(JSON.stringify(parsed.data.fields)),
        settings: nonSecret,
        connectedBy: request.auth?.userId ?? null,
        lastCheckedAt: new Date(),
        lastError: null,
      },
      update: {
        status: "connected",
        accountLabel: verified.accountLabel ?? provider.name,
        apiKeyEnc: encryptSecret(JSON.stringify(parsed.data.fields)),
        settings: nonSecret,
        connectedBy: request.auth?.userId ?? null,
        connectedAt: new Date(),
        lastCheckedAt: new Date(),
        lastError: null,
      },
    });
    recordAuditEvent(request, {
      action: "integration.connected",
      entityType: "integration_connection",
      entityId: connection.id,
      metadata: { provider: provider.id, via: "api_key", key: secretField ? secretHint(parsed.data.fields[secretField.id] ?? "") : undefined },
    });
    return {
      status: "connected",
      provider: provider.id,
      accountLabel: connection.accountLabel,
      checked: verificationAvailable(provider.id),
    };
  });

  /** Start the OAuth round trip (PKCE). Returns the provider's own URL. */
  app.get("/:provider/oauth/start", async (request: FastifyRequest, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, WRITE_ROLES);
    if (roleFailure) return roleFailure;
    const provider = findProvider((request.params as { provider: string }).provider);
    if (!provider) return reply.code(404).send({ message: "Unknown provider" });
    if (provider.authType !== "oauth_pkce") return reply.code(400).send({ message: `${provider.name} doesn't connect this way.` });
    if (!providerAvailable(provider)) {
      return reply.code(503).send({ message: providerUnavailableReason(provider) ?? "Not available yet." });
    }
    if (!encryptionConfigured()) {
      return reply.code(503).send({ message: "This FieldLoop can't store credentials yet (APP_ENCRYPTION_KEY isn't set)." });
    }
    const authorizeUrl = authorizeUrlFor(provider);
    const { clientId } = clientCredentialsFor(provider);
    if (!authorizeUrl || !clientId) return reply.code(503).send({ message: `${provider.name} isn't configured on this FieldLoop yet.` });

    const verifier = createCodeVerifier();
    const state = createState();
    const returnTo = (request.query as { returnTo?: string }).returnTo;
    await prisma.oAuthAuthorization.create({
      data: {
        orgId,
        provider: provider.id,
        state,
        verifierEnc: encryptSecret(verifier),
        redirectUri: callbackUrl(provider.id),
        returnTo: returnTo && returnTo.startsWith("/") ? returnTo : null,
        createdBy: request.auth?.userId ?? null,
        expiresAt: new Date(Date.now() + AUTHORIZATION_TTL_MS),
      },
    });
    return {
      url: buildAuthorizeUrl({
        authorizeUrl,
        clientId,
        redirectUri: callbackUrl(provider.id),
        scopes: provider.scopes ?? [],
        state,
        codeChallenge: codeChallengeFor(verifier),
      }),
    };
  });

  /**
   * The provider's redirect lands here. Every outcome is explicit: the
   * operator either comes back connected, or comes back to a screen that says
   * what happened — declined, expired, or the exchange failed.
   */
  app.get("/oauth/callback/:provider", async (request, reply) => {
    const providerId = (request.params as { provider: string }).provider;
    const provider = findProvider(providerId);
    const query = request.query as { code?: string; state?: string; error?: string };
    if (!provider) return finishRedirect(reply, null, providerId, "failed");

    if (!query.state) return finishRedirect(reply, null, provider.id, "failed");
    const authorization = await prisma.oAuthAuthorization.findUnique({ where: { state: query.state } });
    if (!authorization || authorization.consumedAt || authorization.expiresAt.getTime() < Date.now() || authorization.provider !== provider.id) {
      return finishRedirect(reply, authorization?.returnTo ?? null, provider.id, "failed");
    }
    // Single use, whatever happens next.
    await prisma.oAuthAuthorization.update({ where: { id: authorization.id }, data: { consumedAt: new Date() } });

    if (query.error || !query.code) {
      return finishRedirect(reply, authorization.returnTo, provider.id, query.error === "access_denied" ? "denied" : "failed");
    }

    const tokenUrl = tokenUrlFor(provider);
    const { clientId, clientSecret } = clientCredentialsFor(provider);
    if (!tokenUrl || !clientId) return finishRedirect(reply, authorization.returnTo, provider.id, "failed");

    const exchange = await exchangeCodeForTokens({
      tokenUrl,
      clientId,
      clientSecret,
      code: query.code,
      redirectUri: authorization.redirectUri,
      codeVerifier: decryptSecret(authorization.verifierEnc),
    });
    if (!exchange.ok || !exchange.tokens) {
      await prisma.integrationConnection.updateMany({
        where: { orgId: authorization.orgId, provider: provider.id },
        data: { status: "needs_attention", lastError: exchange.error ?? "Connection failed" },
      });
      return finishRedirect(reply, authorization.returnTo, provider.id, "failed");
    }

    const tokens = exchange.tokens;
    await prisma.integrationConnection.upsert({
      where: { orgId_provider: { orgId: authorization.orgId, provider: provider.id } },
      create: {
        orgId: authorization.orgId,
        provider: provider.id,
        authType: "oauth_pkce",
        status: "connected",
        accountLabel: provider.name,
        scopes: tokens.scope ? tokens.scope.split(" ") : [...(provider.scopes ?? [])],
        accessTokenEnc: encryptSecret(tokens.access_token),
        refreshTokenEnc: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
        expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
        connectedBy: authorization.createdBy,
        lastCheckedAt: new Date(),
        lastError: null,
      },
      update: {
        status: "connected",
        scopes: tokens.scope ? tokens.scope.split(" ") : [...(provider.scopes ?? [])],
        accessTokenEnc: encryptSecret(tokens.access_token),
        refreshTokenEnc: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
        expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
        connectedAt: new Date(),
        lastCheckedAt: new Date(),
        lastError: null,
      },
    });
    return finishRedirect(reply, authorization.returnTo, provider.id, "connected");
  });

  /** "Tell me when this is ready" on a provider we can't connect yet. */
  app.post("/:provider/interest", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, WRITE_ROLES);
    if (roleFailure) return roleFailure;
    const provider = findProvider((request.params as { provider: string }).provider);
    if (!provider) return reply.code(404).send({ message: "Unknown provider" });
    const parsed = parseBody(interestSchema, request.body ?? {});
    if (!parsed.ok) return sendValidationError(reply, parsed.error);
    await prisma.integrationInterest.upsert({
      where: { orgId_provider: { orgId, provider: provider.id } },
      create: { orgId, provider: provider.id, requestedBy: request.auth?.userId ?? null, note: parsed.data.note ?? null },
      update: { note: parsed.data.note ?? null },
    });
    recordAuditEvent(request, { action: "integration.interest_registered", entityType: "integration_interest", entityId: provider.id });
    return { registered: true, provider: provider.id };
  });

  app.delete("/:provider", async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) return sendMissingOrg(reply);
    const roleFailure = requireRole(request, reply, WRITE_ROLES);
    if (roleFailure) return roleFailure;
    const provider = findProvider((request.params as { provider: string }).provider);
    if (!provider) return reply.code(404).send({ message: "Unknown provider" });
    const deleted = await prisma.integrationConnection.deleteMany({ where: { orgId, provider: provider.id } });
    if (deleted.count === 0) return reply.code(404).send({ message: `${provider.name} isn't connected.` });
    recordAuditEvent(request, { action: "integration.disconnected", entityType: "integration_connection", entityId: provider.id });
    return reply.code(204).send();
  });
}
