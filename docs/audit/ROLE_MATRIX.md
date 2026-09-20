# Role Matrix

Generated 2026-09-20 from `apps/api/src/server.ts` (registration prefixes) and
`apps/api/src/routes/*` (gate sites) — Phase 0 proof-spine deliverable. The
companion table-driven test `apps/api/test/roleMatrix.test.ts` asserts every
row below; when you change a gate, change this table and the test together.

## Enforcement mechanics

- **Tenant hook** (`apps/api/src/lib/tenant.ts`): a global `onRequest` hook.
  Bearer token (or `plumbtrack_hq_session` cookie) is HMAC-verified and carries
  `userId, organizationId, role, expiresAt, sid`. A `sid` re-reads the session
  row per request, so the row's role wins and revocation is immediate. The
  `x-organization-id` header must agree with claims (403 otherwise). The
  legacy header path grants a synthetic owner **only** in dev/test; production
  fails closed. Sid-less tokens are dev/test-only.
- **Role gates**: imperative `requireRole(request, reply, roles)` as the first
  handler statement (see `apps/api/src/lib/auth.ts`). Role universe:
  `technician, dispatcher, manager, accountant, admin, owner`
  (`ORGANIZATION_ROLES`).
- **Org isolation**: every Prisma query includes `orgId` from
  `getOrgId(request)` (claims-derived), plus explicit cross-tenant linkage
  guards on job writes. The role matrix does not re-prove org isolation;
  representative cross-org cases live in `teamAccess.test.ts` /
  `securityHardening.test.ts`.

## Shorthand

| Token | Meaning |
|---|---|
| **pub** | Public — tenant-hook exempt; the route self-verifies (rate limit, HMAC signature, capability token, or signed OAuth state) |
| **all** | Any authenticated org role (no `requireRole`) |
| **field** | technician, dispatcher, manager, admin, owner |
| **office** | dispatcher, manager, admin, owner |
| **office+acct** | dispatcher, manager, accountant, admin, owner |
| **mgr+** | manager, admin, owner |
| **admin+** | admin, owner |
| **tech** | technician only |
| ⚠ | **Ungated read** — no `requireRole`; see the Phase 1 flag list below |

## Matrix

### Root & health

| Method | Path | Roles | Scope notes |
|---|---|---|---|
| GET | `/` | pub | Liveness only |
| GET | `/api/health` | pub | Liveness only |

### `/api/auth` — session lifecycle (`auth.ts`)

Self-scoped: every route below acts on the caller's own session.

| Method | Path | Roles | Scope notes |
|---|---|---|---|
| GET | `/api/auth/session` | all | Caller's session + identity |
| GET | `/api/auth/stream-token` | all | Mints stream token reusing own `sid` |
| POST | `/api/auth/device` | pub | **Always 410** — retired enrollment, kept reachable so old builds stop retrying |
| POST | `/api/auth/hq-session` | all (dev/test) | **410 in production**; legacy-header mint in dev only |
| POST | `/api/auth/renew` | all | Extends own session row (never a new one) |
| GET | `/api/auth/sessions` | all | Own device list only |
| DELETE | `/api/auth/sessions/:id` | all | Own session only — userId-scoped; foreign id is a 404 |
| POST | `/api/auth/sign-out` | all | Revokes own session |

### `/api/auth` — accounts (`accounts.ts`)

| Method | Path | Roles | Scope notes |
|---|---|---|---|
| POST | `/api/auth/sign-up` | pub | Rate-limited 10/min/IP; argon2 |
| POST | `/api/auth/login` | pub | Rate-limited 10/min/IP |
| POST | `/api/auth/forgot-password` | pub | Rate-limited |
| POST | `/api/auth/reset-password` | pub | Rate-limited; token-gated |

### `/api/team` (`invites.ts` — teamRoutes)

| Method | Path | Roles | Scope notes |
|---|---|---|---|
| GET | `/api/team/members` | office+acct | Org roster |
| PATCH | `/api/team/members/:userId` | admin+ (self-target allowed) | Advisory-lock last-owner guard; re-stamps member sessions in-tx |
| DELETE | `/api/team/members/:userId` | admin+ (self-target allowed) | Removes membership, never the User row; revokes sessions; last-owner guard |
| POST | `/api/team/members/:userId/sign-out` | admin+ | Lost-phone button; revokes that member's sessions |
| GET | `/api/team/invites` | admin+ | Pending invites |
| POST | `/api/team/invites/:id/revoke` | admin+ | |
| POST | `/api/team/invites` | admin+ | Rate-limited |

### `/api/invites` (`invites.ts` — inviteRoutes)

| Method | Path | Roles | Scope notes |
|---|---|---|---|
| GET | `/api/invites/:token` | pub | Rate-limited; token hashed at rest |
| POST | `/api/invites/:token/accept` | pub | Rate-limited; token is the capability |

### `/api/organizations`

| Method | Path | Roles | Scope notes |
|---|---|---|---|
| GET | `/api/organizations` | all ⚠ | Membership-scoped listing |
| GET | `/api/organizations/:id` | all ⚠ | Membership-checked |
| POST | `/api/organizations` | admin+ | |

### `/api/jobs` (`jobs.ts`)

| Method | Path | Roles | Scope notes |
|---|---|---|---|
| GET | `/api/jobs` | all ⚠ | Org-scoped, read caps + indexes |
| POST | `/api/jobs` | office | Auto-creates unassigned schedulable appointment |
| GET | `/api/jobs/:id` | all ⚠ | Org-scoped |
| PATCH | `/api/jobs/:id/assignment` | office | Per-technician advisory-lock tx (double-book guard) |
| PATCH | `/api/jobs/:id` | **cond** | `{status, signature}`-only body → **field**; any other field → **mgr+**. Validation runs *before* the gate (body determines the role set) |
| DELETE | `/api/jobs/:id` | admin+ | |
| POST | `/api/jobs/:id/time-entries` | field | `staffId` defaults to the caller |
| PATCH | `/api/jobs/:id/checklist-items/:itemId` | field | Org-scoped via parent job |
| PATCH | `/api/jobs/:id/time-entries/:entryId` | **cond** | `{end}`-only body (or `entryId === "open"`) → **field**, resolves only the caller's own open entry; other fields → **mgr+**. Validation before gate |
| POST | `/api/jobs/:id/photos` | field | |
| DELETE | `/api/jobs/:id/photos/:photoId` | mgr+ | Parent-job org verified |
| POST | `/api/jobs/:id/signoff` | field | |
| POST | `/api/jobs/:id/events` | field | Arrival/departure persistence |
| POST | `/api/jobs/:id/payment-link` | field | ⚠ Phase 1: amounts must become server-priced |
| POST | `/api/jobs/:id/notes` | field | |

### `/api/jobs` + `/api/messages` (`jobMessages.ts`)

| Method | Path | Roles | Scope notes |
|---|---|---|---|
| GET | `/api/jobs/:id/messages` | all ⚠ | Org-scoped via parent job |
| POST | `/api/jobs/:id/messages` | field | Technician may post only `direction: "field"` |
| GET | `/api/messages/threads` | all ⚠ | Office thread view |

### `/api/quotes`

| Method | Path | Roles | Scope notes |
|---|---|---|---|
| GET | `/api/quotes` | all ⚠ | Org-scoped |
| POST | `/api/quotes` | office+acct | |
| GET | `/api/quotes/:id` | all ⚠ | Org-scoped |
| PATCH | `/api/quotes/:id` | office+acct | Status transitions (draft→sent→approved/declined) |
| DELETE | `/api/quotes/:id` | mgr+ | |
| POST | `/api/quotes/:id/lines` | office+acct | |
| PATCH | `/api/quotes/:id/lines/:lineId` | office+acct | Scoped to org-verified quote |
| DELETE | `/api/quotes/:id/lines/:lineId` | office+acct | |

### `/api/notifications`

| Method | Path | Roles | Scope notes |
|---|---|---|---|
| GET | `/api/notifications/status` | all ⚠ | Provider status |
| GET | `/api/notifications` | all ⚠ | Feed |
| POST | `/api/notifications` | field | All roles except accountant |

### `/api` documents + RFIs (`documents.ts` — registered under the bare `/api` prefix)

| Method | Path | Roles | Scope notes |
|---|---|---|---|
| GET | `/api/documents` | all ⚠ | Org vault listing |
| POST | `/api/documents` | field | FIELD_ROLES create/version |
| PATCH | `/api/documents/:id` | mgr+ | OFFICE_ROLES (documents) |
| POST | `/api/documents/:id/versions` | field | |
| DELETE | `/api/documents/:id` | mgr+ | |
| GET | `/api/jobs/:jobId/rfis` | all ⚠ | |
| POST | `/api/jobs/:jobId/rfis` | field | |
| PATCH | `/api/rfis/:id` | field | |

### `/api/media`

| Method | Path | Roles | Scope notes |
|---|---|---|---|
| POST | `/api/media/upload-intents` | field | Signed-intent choreography |
| POST | `/api/media/:assetId/complete` | field | |
| GET | `/api/media/:assetId/file` | pub | Capability cuid (unguessable stable id) |

### `/api/customers` (`residential.ts` — customerRoutes)

| Method | Path | Roles | Scope notes |
|---|---|---|---|
| GET | `/api/customers` | all ⚠ | **Full directory incl. property access codes** — see Phase 1 flag |
| POST | `/api/customers` | field | operationalRoles |
| GET | `/api/customers/:id/agreements` | all ⚠ | |
| POST | `/api/customers/:id/agreements` | office | |
| PUT | `/api/customers/:customerId/agreements/:agreementId` | office | |
| GET | `/api/customers/:id/properties` | all ⚠ | Includes access codes |
| POST | `/api/customers/:id/properties` | field | |
| GET | `/api/customers/:id` | all ⚠ | |
| PATCH | `/api/customers/:id` | office | |
| PATCH | `/api/customers/:customerId/properties/:propertyId` | office | |

### `/api/appointments` (`residential.ts` — appointmentRoutes)

| Method | Path | Roles | Scope notes |
|---|---|---|---|
| GET | `/api/appointments` | all ⚠ | |
| POST | `/api/appointments` | office | |
| PATCH | `/api/appointments/:id` | **cond** | `{status ∈ en_route/arrived/working/awaiting_customer/awaiting_parts/complete}` → **office + technician**; assignment/schedule edits → **office**. Validation before gate |

### `/api/integrations` (`integrations.ts` + `connections.ts`)

| Method | Path | Roles | Scope notes |
|---|---|---|---|
| GET | `/api/integrations/deliveries` | all ⚠ | Delivery outbox log |
| GET | `/api/integrations/health` | all ⚠ | |
| POST | `/api/integrations/deliveries/:id/retry` | office | |
| GET | `/api/integrations` | office+acct | Connection list |
| POST | `/api/integrations/:provider/test` | admin+ | |
| POST | `/api/integrations/:provider/api-key` | admin+ | |
| GET | `/api/integrations/:provider/oauth/start` | admin+ | |
| GET | `/api/integrations/oauth/callback/:provider` | pub | Single-use signed state row |
| POST | `/api/integrations/:provider/interest` | admin+ | |
| DELETE | `/api/integrations/:provider` | admin+ | |

### `/api/setup`

| Method | Path | Roles | Scope notes |
|---|---|---|---|
| GET | `/api/setup` | office+acct | Wizard state |
| PUT | `/api/setup/step` | admin+ | OWNER_ROLES |
| POST | `/api/setup/launch` | admin+ | |
| GET | `/api/setup/abn/:abn` | admin+ | ABR lookup |

### `/api/slack` (`slackEvents.ts` + `slack.ts`)

| Method | Path | Roles | Scope notes |
|---|---|---|---|
| GET | `/api/slack/status` | all ⚠ | Webhook config status |
| POST | `/api/slack/events` | pub | Slack HMAC v0 signature-verified |
| GET | `/api/slack/workspace` | office | |
| GET | `/api/slack/oauth/url` | mgr+ | |
| GET | `/api/slack/oauth/callback` | pub | Signed state |
| POST | `/api/slack/workspace` | admin+ | |
| DELETE | `/api/slack/workspace` | admin+ | |
| GET | `/api/slack/routes` | office | Routing editor |
| PUT | `/api/slack/routes/:eventType` | mgr+ | |
| DELETE | `/api/slack/routes/:eventType` | mgr+ | |
| GET | `/api/slack/channels` | office | Real channel reads |
| GET | `/api/slack/channels/:channelId/messages` | office | |

### Webhooks, fleet, routing, SMS, board, stream, sync

| Method | Path | Roles | Scope notes |
|---|---|---|---|
| POST | `/api/webhooks/stripe` | pub | Stripe HMAC (raw body) |
| POST | `/api/fleet/telemetry` | tech | Field devices only |
| POST | `/api/fleet/location-consent` | all | Deliberately un-gated: self-attributed consent, no cross-user authority |
| GET | `/api/routing/shape` | office | ORS proxy |
| GET | `/api/routing/matrix` | office | |
| GET | `/api/routing/geocode` | field | |
| GET | `/api/routing/reverse` | field | |
| GET | `/api/routing/isochrones` | office | |
| POST | `/api/routing/snap` | office | |
| POST | `/api/routing/optimize` | office | |
| POST | `/api/sms/eta` | office | ⚠ Phase 1: add technician scoped to own assigned job |
| GET | `/api/routes/today` | field | Day-route snapshot (versioned) |
| GET | `/api/stream` | pub (WS) | Query-param token verified in-route; org channel from verified claims — not injection-testable |
| GET | `/api/sync` | all | WatermelonDB pull |
| GET | `/api/board` | all ⚠ | HQ board aggregate |
| GET | `/api/board/needs-attention` | all ⚠ | |

**Totals**: 121 registrations (120 in `src/routes/` + `GET /`); 119 are
HTTP-injection testable (`/api/stream` is WebSocket-only).

## ⚠ Phase 1 flag — ungated reads

Routes marked ⚠ have **no `requireRole`**: any authenticated org role
(including technician and accountant) may read them. Org isolation still
holds — the flag is about *role* least-privilege, not tenancy. The
security-relevant subset, in priority order:

1. **`GET /api/customers`, `/:id`, `/:id/properties`, `/:id/agreements`** —
   the full customer directory *including property access codes* is readable
   by any technician session. Roadmap Phase 1 replaces this with a
   field-safe projection (id/name/phone only, customers the technician has
   jobs for).
2. `GET /api/appointments` — schedule + assignment detail for the whole org.
3. `GET /api/jobs`, `GET /api/jobs/:id`, `GET /api/quotes`, `GET /api/quotes/:id` —
   job/quote reads incl. quote pricing.
4. `GET /api/board`, `/needs-attention` — the full dispatch aggregate.
5. `GET /api/documents`, rfis, messages/threads, integrations
   deliveries/health, notifications, organizations, slack status — operational
   reads.

None of these are *changed* by Phase 0 — the matrix records current truth so
the Phase 1 least-privilege pass has an evidence baseline.

## Test encoding

`apps/api/test/roleMatrix.test.ts` encodes every injectable row as
`{method, url, roles, payload?}` and asserts, per row:

- anonymous → 401 (public rows: not-401, proving the exemption survives);
- every role **not** in the list → 403;
- every listed role → status is neither 401 nor 403 (the authz contract —
  downstream 400/404s from validation/missing fixtures are acceptable
  evidence the gate passed).

The three conditional routes (`PATCH /api/jobs/:id`,
`PATCH /api/jobs/:id/time-entries/:entryId`,
`PATCH /api/appointments/:id`) validate the body **before** the role gate
(the body determines the role set), so their disallowed-role assertion
accepts 400-or-403 with an empty-body probe; dedicated rows with valid
bodies (`{"status":"completed"}`, `{"status":"en_route"}`) pin the field
branches strictly.
