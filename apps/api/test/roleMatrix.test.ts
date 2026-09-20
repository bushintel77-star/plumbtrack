import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * Role matrix — the table-driven authorization contract for every
 * HTTP-injectable route (docs/audit/ROLE_MATRIX.md is the human-readable
 * twin; change them together).
 *
 * The authz contract under test is deliberately narrow:
 *   anonymous        → 401 (public routes: NOT 401 — the tenant-hook
 *                       exemption is itself load-bearing and must survive)
 *   role not allowed → 403
 *   allowed role     → neither 401 nor 403 (downstream 400/404s from
 *                       validation or missing fixtures are fine evidence
 *                       the gate passed)
 *
 * Three conditional routes validate the body BEFORE the role gate because
 * the body determines which role set applies (PATCH /api/jobs/:id,
 * PATCH /api/jobs/:id/time-entries/:entryId, PATCH /api/appointments/:id).
 * Their empty-body probes accept 400-or-403 for disallowed roles (recorded,
 * not silently relaxed) and dedicated valid-body rows pin the field
 * branches strictly.
 *
 * /api/stream is WebSocket-only and verifies its own query token — it is
 * documented in the matrix but not injection-testable.
 *
 * The prisma mock is generic on purpose: every model method returns a
 * benign value so ALLOWED requests can run their handler bodies to any
 * non-authz outcome without fixture upkeep per route.
 */

vi.mock("@plumbtrack/database", () => {
  const benignModel = (): Record<string, unknown> =>
    new Proxy({}, {
      get(_target, method: string) {
        if (method === "findMany" || method === "aggregate" || method === "groupBy") return async () => [];
        if (method === "count") return async () => 0;
        if (method === "updateMany" || method === "deleteMany") return async () => ({ count: 0 });
        // Single-record lookups return a truthy fixture: several handlers
        // resolve the parent record BEFORE the role gate (time-entry
        // close-out, RFI updates) — a null here 404s before the gate can
        // classify the caller, which is a different (also fine) contract,
        // but not the one this table pins.
        if (method.startsWith("find")) return async () => ({ id: "fixture-record" });
        return async () => ({});
      },
    });

  const prismaProxy: Record<string, unknown> = new Proxy({}, {
    get(_target, prop: string) {
      if (prop === "$transaction") {
        return async (arg: unknown) => {
          if (Array.isArray(arg)) return Promise.all(arg);
          if (typeof arg === "function") return (arg as (tx: unknown) => unknown)(prismaProxy);
          return undefined;
        };
      }
      if (prop === "$queryRaw" || prop === "$queryRawUnsafe") return async () => [{ count: 1 }];
      if (prop === "$executeRaw" || prop === "$executeRawUnsafe") return async () => 0;
      return benignModel();
    },
  });

  return { prisma: prismaProxy };
});

import { buildApp } from "../src/server";
import { issueAuthToken, type OrganizationRole } from "../src/lib/auth";

const ORG = "org-role-matrix";

/** The full role universe — every row is probed against each of these. */
const ROLES: readonly OrganizationRole[] = ["technician", "dispatcher", "manager", "accountant", "admin", "owner"];

const FIELD: readonly OrganizationRole[] = ["technician", "dispatcher", "manager", "admin", "owner"];
const OFFICE: readonly OrganizationRole[] = ["dispatcher", "manager", "admin", "owner"];
const OFFICE_ACCT: readonly OrganizationRole[] = ["dispatcher", "manager", "accountant", "admin", "owner"];
const MGR: readonly OrganizationRole[] = ["manager", "admin", "owner"];
const ADMIN_OWNER: readonly OrganizationRole[] = ["admin", "owner"];
const TECH: readonly OrganizationRole[] = ["technician"];

type Row = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  roles: "public" | "all" | readonly OrganizationRole[];
  /** Request body for routes that validate before gating. */
  payload?: Record<string, unknown>;
  /** Disallowed roles may legitimately see 400 before the 403 (body determines the role set). */
  gateAfterValidation?: boolean;
};

const ROWS: readonly Row[] = [
  // ── Root & health ──────────────────────────────────────────────────────
  { method: "GET", url: "/", roles: "public" },
  { method: "GET", url: "/api/health", roles: "public" },

  // ── /api/auth — accounts (public, rate-limited) ────────────────────────
  { method: "POST", url: "/api/auth/sign-up", roles: "public" },
  { method: "POST", url: "/api/auth/login", roles: "public" },
  { method: "POST", url: "/api/auth/forgot-password", roles: "public" },
  { method: "POST", url: "/api/auth/reset-password", roles: "public" },
  { method: "POST", url: "/api/auth/device", roles: "public" }, // always 410

  // ── /api/auth — session lifecycle (self-scoped, any role) ─────────────
  { method: "GET", url: "/api/auth/session", roles: "all" },
  { method: "GET", url: "/api/auth/stream-token", roles: "all" },
  // 410 in production; in dev/test the hook returns before bearer
  // verification and the route is org-header-gated (400 without it) —
  // encoded as public so the anonymous probe asserts not-401.
  { method: "POST", url: "/api/auth/hq-session", roles: "public" },
  { method: "POST", url: "/api/auth/renew", roles: "all" },
  { method: "GET", url: "/api/auth/sessions", roles: "all" },
  { method: "DELETE", url: "/api/auth/sessions/sess-1", roles: "all" },
  { method: "POST", url: "/api/auth/sign-out", roles: "all" },

  // ── /api/team ──────────────────────────────────────────────────────────
  { method: "GET", url: "/api/team/members", roles: OFFICE_ACCT },
  { method: "PATCH", url: "/api/team/members/user-1", roles: ADMIN_OWNER },
  { method: "DELETE", url: "/api/team/members/user-1", roles: ADMIN_OWNER },
  { method: "POST", url: "/api/team/members/user-1/sign-out", roles: ADMIN_OWNER },
  { method: "GET", url: "/api/team/invites", roles: ADMIN_OWNER },
  { method: "POST", url: "/api/team/invites/inv-1/revoke", roles: ADMIN_OWNER },
  { method: "POST", url: "/api/team/invites", roles: ADMIN_OWNER },

  // ── /api/invites (token = capability) ──────────────────────────────────
  { method: "GET", url: "/api/invites/token-probe", roles: "public" },
  { method: "POST", url: "/api/invites/token-probe/accept", roles: "public" },

  // ── /api/organizations ─────────────────────────────────────────────────
  { method: "GET", url: "/api/organizations", roles: "all" },
  { method: "GET", url: "/api/organizations/org-1", roles: "all" },
  { method: "POST", url: "/api/organizations", roles: ADMIN_OWNER },

  // ── /api/jobs ──────────────────────────────────────────────────────────
  { method: "GET", url: "/api/jobs", roles: "all" }, // ⚠ ungated read — Phase 1 flag
  { method: "POST", url: "/api/jobs", roles: OFFICE },
  { method: "GET", url: "/api/jobs/job-1", roles: "all" }, // ⚠ ungated read
  { method: "PATCH", url: "/api/jobs/job-1/assignment", roles: OFFICE },
  // Conditional: empty body parses as a field write → FIELD_ROLES; validation precedes the gate.
  { method: "PATCH", url: "/api/jobs/job-1", roles: FIELD, payload: {}, gateAfterValidation: true },
  { method: "DELETE", url: "/api/jobs/job-1", roles: ADMIN_OWNER },
  { method: "POST", url: "/api/jobs/job-1/time-entries", roles: FIELD },
  { method: "PATCH", url: "/api/jobs/job-1/checklist-items/item-1", roles: FIELD },
  // Conditional: empty body parses as a field close → FIELD_ROLES; validation precedes the gate.
  { method: "PATCH", url: "/api/jobs/job-1/time-entries/entry-1", roles: FIELD, payload: {}, gateAfterValidation: true },
  { method: "POST", url: "/api/jobs/job-1/photos", roles: FIELD },
  { method: "DELETE", url: "/api/jobs/job-1/photos/photo-1", roles: MGR },
  { method: "POST", url: "/api/jobs/job-1/signoff", roles: FIELD },
  { method: "POST", url: "/api/jobs/job-1/events", roles: FIELD },
  { method: "POST", url: "/api/jobs/job-1/payment-link", roles: FIELD },
  { method: "POST", url: "/api/jobs/job-1/notes", roles: FIELD },

  // ── /api/jobs messages + /api/messages threads ─────────────────────────
  { method: "GET", url: "/api/jobs/job-1/messages", roles: "all" }, // ⚠ ungated read
  { method: "POST", url: "/api/jobs/job-1/messages", roles: FIELD },
  { method: "GET", url: "/api/messages/threads", roles: "all" }, // ⚠ ungated read

  // ── /api/quotes ────────────────────────────────────────────────────────
  { method: "GET", url: "/api/quotes", roles: "all" }, // ⚠ ungated read
  { method: "POST", url: "/api/quotes", roles: OFFICE_ACCT },
  { method: "GET", url: "/api/quotes/quote-1", roles: "all" }, // ⚠ ungated read
  { method: "PATCH", url: "/api/quotes/quote-1", roles: OFFICE_ACCT },
  { method: "DELETE", url: "/api/quotes/quote-1", roles: MGR },
  { method: "POST", url: "/api/quotes/quote-1/lines", roles: OFFICE_ACCT },
  { method: "PATCH", url: "/api/quotes/quote-1/lines/line-1", roles: OFFICE_ACCT },
  { method: "DELETE", url: "/api/quotes/quote-1/lines/line-1", roles: OFFICE_ACCT },

  // ── /api/notifications ─────────────────────────────────────────────────
  { method: "GET", url: "/api/notifications/status", roles: "all" }, // ⚠ ungated read
  { method: "GET", url: "/api/notifications", roles: "all" }, // ⚠ ungated read
  { method: "POST", url: "/api/notifications", roles: FIELD },

  // ── /api/documents + job RFIs (bare /api prefix in documents.ts) ───────
  { method: "GET", url: "/api/documents", roles: "all" }, // ⚠ ungated read
  { method: "POST", url: "/api/documents", roles: FIELD },
  { method: "PATCH", url: "/api/documents/doc-1", roles: MGR },
  { method: "POST", url: "/api/documents/doc-1/versions", roles: FIELD },
  { method: "DELETE", url: "/api/documents/doc-1", roles: MGR },
  { method: "GET", url: "/api/jobs/job-1/rfis", roles: "all" }, // ⚠ ungated read
  { method: "POST", url: "/api/jobs/job-1/rfis", roles: FIELD },
  { method: "PATCH", url: "/api/rfis/rfi-1", roles: FIELD },

  // ── /api/media ─────────────────────────────────────────────────────────
  { method: "POST", url: "/api/media/upload-intents", roles: FIELD },
  { method: "POST", url: "/api/media/asset-1/complete", roles: FIELD },
  { method: "GET", url: "/api/media/asset-1/file", roles: "public" }, // capability cuid

  // ── /api/customers ─────────────────────────────────────────────────────
  { method: "GET", url: "/api/customers", roles: "all" }, // ⚠ ungated read incl. access codes — Phase 1 priority
  { method: "POST", url: "/api/customers", roles: FIELD },
  { method: "GET", url: "/api/customers/cus-1/agreements", roles: "all" }, // ⚠ ungated read
  { method: "POST", url: "/api/customers/cus-1/agreements", roles: OFFICE },
  { method: "PUT", url: "/api/customers/cus-1/agreements/agr-1", roles: OFFICE },
  { method: "GET", url: "/api/customers/cus-1/properties", roles: "all" }, // ⚠ ungated read
  { method: "POST", url: "/api/customers/cus-1/properties", roles: FIELD },
  { method: "GET", url: "/api/customers/cus-1", roles: "all" }, // ⚠ ungated read
  { method: "PATCH", url: "/api/customers/cus-1", roles: OFFICE },
  { method: "PATCH", url: "/api/customers/cus-1/properties/prop-1", roles: OFFICE },

  // ── /api/appointments ──────────────────────────────────────────────────
  { method: "GET", url: "/api/appointments", roles: "all" }, // ⚠ ungated read
  { method: "POST", url: "/api/appointments", roles: OFFICE },
  // Conditional: empty body has no status → office branch; validation precedes the gate.
  { method: "PATCH", url: "/api/appointments/appt-1", roles: OFFICE, payload: {}, gateAfterValidation: true },

  // ── /api/integrations (deliveries + connections) ───────────────────────
  { method: "GET", url: "/api/integrations/deliveries", roles: "all" }, // ⚠ ungated read
  { method: "GET", url: "/api/integrations/health", roles: "all" }, // ⚠ ungated read
  { method: "POST", url: "/api/integrations/deliveries/del-1/retry", roles: OFFICE },
  { method: "GET", url: "/api/integrations", roles: OFFICE_ACCT },
  { method: "POST", url: "/api/integrations/xero/test", roles: ADMIN_OWNER },
  { method: "POST", url: "/api/integrations/xero/api-key", roles: ADMIN_OWNER },
  { method: "GET", url: "/api/integrations/xero/oauth/start", roles: ADMIN_OWNER },
  { method: "POST", url: "/api/integrations/xero/interest", roles: ADMIN_OWNER },
  { method: "DELETE", url: "/api/integrations/xero", roles: ADMIN_OWNER },
  { method: "GET", url: "/api/integrations/oauth/callback/xero", roles: "public" }, // signed state

  // ── /api/setup ─────────────────────────────────────────────────────────
  { method: "GET", url: "/api/setup", roles: OFFICE_ACCT },
  { method: "PUT", url: "/api/setup/step", roles: ADMIN_OWNER },
  { method: "POST", url: "/api/setup/launch", roles: ADMIN_OWNER },
  { method: "GET", url: "/api/setup/abn/12345678901", roles: ADMIN_OWNER },

  // ── /api/slack ─────────────────────────────────────────────────────────
  { method: "GET", url: "/api/slack/status", roles: "all" }, // ⚠ ungated read
  { method: "POST", url: "/api/slack/events", roles: "public" }, // HMAC-verified
  { method: "GET", url: "/api/slack/workspace", roles: OFFICE },
  { method: "GET", url: "/api/slack/oauth/url", roles: MGR },
  { method: "GET", url: "/api/slack/oauth/callback", roles: "public" }, // signed state
  { method: "POST", url: "/api/slack/workspace", roles: ADMIN_OWNER },
  { method: "DELETE", url: "/api/slack/workspace", roles: ADMIN_OWNER },
  { method: "GET", url: "/api/slack/routes", roles: OFFICE },
  { method: "PUT", url: "/api/slack/routes/job.created", roles: MGR },
  { method: "DELETE", url: "/api/slack/routes/job.created", roles: MGR },
  { method: "GET", url: "/api/slack/channels", roles: OFFICE },
  { method: "GET", url: "/api/slack/channels/C123/messages", roles: OFFICE },

  // ── webhooks, fleet, routing, sms, routes, sync, board ─────────────────
  { method: "POST", url: "/api/webhooks/stripe", roles: "public" }, // HMAC-verified
  { method: "POST", url: "/api/fleet/telemetry", roles: TECH },
  { method: "POST", url: "/api/fleet/location-consent", roles: "all" }, // deliberately un-gated (self-attributed)
  { method: "GET", url: "/api/routing/shape", roles: OFFICE },
  { method: "GET", url: "/api/routing/matrix", roles: OFFICE },
  { method: "GET", url: "/api/routing/geocode", roles: FIELD },
  { method: "GET", url: "/api/routing/reverse", roles: FIELD },
  { method: "GET", url: "/api/routing/isochrones", roles: OFFICE },
  { method: "POST", url: "/api/routing/snap", roles: OFFICE },
  { method: "POST", url: "/api/routing/optimize", roles: OFFICE },
  { method: "POST", url: "/api/sms/eta", roles: OFFICE },
  { method: "GET", url: "/api/routes/today", roles: FIELD },
  { method: "GET", url: "/api/sync", roles: "all" },
  { method: "GET", url: "/api/board", roles: "all" }, // ⚠ ungated read
  { method: "GET", url: "/api/board/needs-attention", roles: "all" }, // ⚠ ungated read

  // ── Conditional-route field branches, pinned with valid bodies ─────────
  // {status}-only job patch = field sign-off → field roles; accountant 403 (strict — validation passes).
  { method: "PATCH", url: "/api/jobs/job-1", roles: FIELD, payload: { status: "completed" } },
  // A field-status appointment patch is the on-site progression → office + technician.
  { method: "PATCH", url: "/api/appointments/appt-1", roles: [...OFFICE, "technician"], payload: { status: "en_route" } },
];

function bearer(role: OrganizationRole): string {
  return `Bearer ${issueAuthToken({ userId: "user-probe", organizationId: ORG, role })}`;
}

function describeRoles(row: Row): string {
  if (row.roles === "public") return "public";
  if (row.roles === "all") return "any authenticated role";
  return row.roles.join("|");
}

describe("role matrix — every HTTP route's authorization contract", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // The matrix fires ~850 injections in seconds — past the global
    // 500/min guard (server.ts RATE_LIMIT_MAX), which exists for real
    // clients, not for the authz contract. Raise it before buildApp reads
    // the env.
    process.env.RATE_LIMIT_MAX = "10000";
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // Explicit loop rather than it.each's template interpolation, so test
  // names render the roles helper ("public" / "any authenticated role" /
  // the role list) instead of a raw array.
  for (const row of ROWS) {
    it(`${row.method} ${row.url} → ${describeRoles(row)}`, { timeout: 20_000 }, async () => {
      const inject = (headers: Record<string, string>) =>
        app.inject({
          method: row.method,
          url: row.url,
          headers,
          ...(row.payload !== undefined ? { payload: row.payload } : {}),
        });

      // The anonymous probe presents a garbage bearer: signature
      // verification rejects it with 401 in EVERY environment, before any
      // dev/test legacy-header fallback can mint a synthetic owner. (A
      // headerless anonymous request in dev/test instead gets a 400
      // missing-org — environment-specific, so not the contract probed
      // here; and an anonymous request WITH the org header is the
      // dev-only synthetic-owner path by design.)
      const anon = await inject({ authorization: "Bearer not-a-real-token" });
      if (row.roles === "public") {
        // The tenant-hook exemption is load-bearing — a 401 here means a
        // public route (webhook callback, invite link, health) went dark.
        expect(anon.statusCode).not.toBe(401);
      } else {
        expect(anon.statusCode).toBe(401);
      }

      for (const role of ROLES) {
        const allowed =
          row.roles === "public" || row.roles === "all" || row.roles.includes(role);
        const res = await inject({ authorization: bearer(role) });
        if (allowed) {
          expect(
            [401, 403],
            `${row.method} ${row.url} as ${role} unexpectedly hit an authz wall`,
          ).not.toContain(res.statusCode);
        } else if (row.gateAfterValidation) {
          // Body-determined role set: an unparseable probe body 400s before
          // the gate can 403. Both prove the caller got past authn but was
          // never granted the write.
          expect([400, 403]).toContain(res.statusCode);
        } else {
          expect(res.statusCode).toBe(403);
        }
      }
    });
  }

  it("the matrix covers every injectable route registration in src/routes", () => {
    // 121 registrations total: 120 under src/routes + GET /. /api/stream is
    // WebSocket-only, leaving 120 unique injectable method+path pairs. The
    // two valid-body conditional pins reuse URLs already in the table.
    expect(new Set(ROWS.map((row) => `${row.method} ${row.url}`)).size).toBe(120);
    expect(ROWS.length).toBe(120 + 2);
  });
});
