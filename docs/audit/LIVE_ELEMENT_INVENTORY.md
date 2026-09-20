# FieldLoop — Live Element Inventory

**Phase:** 1 — inventory only
**Audit date:** 2026-09-20
**Scope:** monorepo `apps/api`, `apps/hq`, and the local field-agent checkout `my-mobile-app`
**Method:** source walk of route trees and interactive handlers, cross-referenced with `HANDOVER.md`, `AGENTS.md`, `PRODUCTION_READINESS.md`, and the canonical design spec. This is a code audit, not a claim that every provider or production deployment was exercised.

## Status legend

- **LIVE** — a real implementation and backend call exist, with no known false-success path in the inspected code.
- **HONEST-UNWIRED** — the UI intentionally says what provider, credential, or product decision is missing.
- **FAKE** — the UI can show success or business state without a corresponding server/provider write.
- **BROKEN** — the action calls an unavailable, incorrectly authorized, malformed, or semantically wrong path.
- **PLACEHOLDER** — sample, fallback, or hardcoded business identity/content can appear as if it were production data.
- **DEGRADED** — the primary path exists, but an explicitly documented fallback limits the result.

`code` means verified by reading the current source. `record` means carried forward from the dated readiness/handover record and still requiring a live check before release. No row is marked end-to-end verified unless the evidence says so.

## Summary — before Phase 2/3 fixes

| Status | API | HQ | Field agent | Total | Basis |
|---|---:|---:|---:|---:|---|
| LIVE | 100 | 30 | 31 | 161 | Source-level implementation present |
| HONEST-UNWIRED / DEGRADED | 8 | 5 | 7 | 20 | Explicit unavailable/provider or fallback state |
| FAKE | 0 | 1 | 2 | 3 | Source still permits local success without a server write |
| BROKEN | 1 | 2 | 4 | 7 | Source/readiness evidence identifies a non-working contract |
| PLACEHOLDER | 0 | 1 | 4 | 5 | Hardcoded identity/config/sample content remains reachable |

These counts are inventory counts, not release acceptance counts. Rows can contain more than one interactive control where the controls share one contract; the detailed tables are the authoritative task list.

## Cross-surface release blockers found in Phase 1

1. Field-agent operator identity and some configuration still have hardcoded/fallback values (`Dave`, `staff-1`, `van-1`, org and localhost fallbacks).
2. Field-agent “On my way” and invoice controls have a local or incomplete success path; they require real SMS/invoice/payment contracts.
3. Field-agent photo upload and HQ CRM/payment paths require contract verification; the readiness record identifies a base64-vs-bytes photo issue, name-based CRM matching, and client-supplied payment amount as risks.
4. HQ comms has a local Slack-card path in addition to the real Slack thread surface; it must be removed or made provider-backed.
5. The customer portal described by the design spec has no route tree in this repository; it is not counted as a live surface.
6. API route validation and row-level authorization are not uniform. A route being tenant-hooked is not evidence that its record scope is correct for every role.
7. The repository has no current production e2e proof for the Crewline shell or native field agent; unit/typecheck results do not close those rows.

---

# 1. API route inventory — `apps/api/src/routes`

The tenant hook is assumed on normal API routes, but each row still needs the listed role and record-scope contract. `FIELD_ROLES`, `OFFICE_ROLES`, `ROUTE_ROLES`, `NOTIFICATION_AUTHORS`, and `operationalRoles` refer to the role sets in the route/auth helpers. “Schema” means an explicit Zod/body/query parser was observed; “manual” means the route performs ad-hoc checks or casts and is a Phase 5 task.

## Auth and session routes

| Surface | Route | Element/action | Current behaviour | Backend call(s) | Auth/role | Validation | Offline | A11y | Status | Fix / evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| API | `GET /api/auth/session` | Session probe | Returns current authenticated session | session middleware | authenticated session | none/bodyless | retry at client | n/a | LIVE | `apps/api/src/routes/auth.ts` |
| API | `GET /api/auth/stream-token` | Stream token | Mints token for live stream | session lookup | authenticated session | none/bodyless | reconnect | n/a | LIVE | `auth.ts` |
| API | `POST /api/auth/device` | Device enrollment | Legacy/bootstrap device session path; production retirement is documented | auth session store | bootstrap secret / production 410 | manual | queued enrollment is retryable | n/a | HONEST-UNWIRED | Phase 4 replaces shared device secret with per-operator binding |
| API | `POST /api/auth/hq-session` | HQ station sign-in | Legacy/bootstrap HQ session path; production retirement is documented | auth session store | bootstrap secret / production 410 | manual | no | n/a | HONEST-UNWIRED | Phase 4 replaces shared bootstrap identity |
| API | `POST /api/auth/renew` | Renew current session | Extends the same session row | session store | own authenticated session | bodyless | retry on visibility/heartbeat | n/a | LIVE | `auth.ts` |
| API | `GET /api/auth/sessions` | List own devices | Returns caller-owned sessions | session store | authenticated self only | bodyless | read retry | n/a | LIVE | `auth.ts` |
| API | `DELETE /api/auth/sessions/:id` | Revoke own device | Revokes one caller-owned session | session store | authenticated self only | path check | retryable mutation | n/a | LIVE | `auth.ts` |
| API | `POST /api/auth/sign-out` | Sign out | Revokes current session and clears client state | session store | authenticated | bodyless | local sign-out fallback | n/a | LIVE | `auth.ts` |
| API | `POST /api/auth/sign-up` | Create account | Creates organization/user/membership session | account service | public, rate-limited | schema | no | n/a | LIVE | `accounts.ts` |
| API | `POST /api/auth/login` | Account login | Authenticates email/password and issues session | account service | public, rate-limited | schema | no | n/a | LIVE | `accounts.ts` |
| API | `POST /api/auth/forgot-password` | Password reset request | Sends reset when email provider is configured; otherwise reports unconfigured | account service/email adapter | public, rate-limited | schema | no | n/a | HONEST-UNWIRED | Provider credential is an owner action |
| API | `POST /api/auth/reset-password` | Apply reset token | Consumes reset token and changes password | account service | public token, rate-limited | schema | no | n/a | LIVE | `accounts.ts` |

## Board, jobs, and field work

| Surface | Route | Element/action | Current behaviour | Backend call(s) | Auth/role | Validation | Offline | A11y | Status | Fix / evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| API | `GET /api/board` | HQ board read | Returns jobs, staff, appointments and board state | Prisma board query | authenticated org member | query parser | cached/demo only under explicit demo flag | n/a | LIVE | HQ live hydration contract |
| API | `GET /api/board/needs-attention` | Attention flags | Returns computed board flags | Prisma/selector | authenticated org member | query parser | cached read | n/a | DEGRADED | Verify travel-buffer parity with the design selector |
| API | `GET /api/jobs` | Job list | Returns org-scoped jobs | Prisma | authenticated; field row scope requires explicit decision | query parser | local DB/sync on field | n/a | LIVE | Confirm technician sees only permitted jobs |
| API | `POST /api/jobs` | New job intake | Creates job and schedulable unassigned appointment | Prisma transaction | office roles | body parser/manual checks | HQ queues only if action layer supports it | n/a | LIVE | `jobs.ts`; add contract test for all required fields |
| API | `GET /api/jobs/:id` | Job detail | Returns a job detail | Prisma | authenticated org member; row scope requires explicit decision | path/bodyless | local sync fallback | n/a | LIVE | Verify field user can only open assigned/synced jobs |
| API | `PATCH /api/jobs/:id/assignment` | Drag/drop assignment | Server validates technician, skill, overlap/travel policy and mutates appointment | Prisma transaction/advisory lock | office roles | assignment schema | HQ outbox with opId and rollback | n/a | LIVE | Add route/e2e evidence for rejection and rollback |
| API | `PATCH /api/jobs/:id` | Status/signature/job mutation | Field role is restricted to status/signature; office roles may edit broader fields | Prisma | field progression or office roles | mixed/manual | outbox | n/a | LIVE | Complete uniform Zod audit |
| API | `DELETE /api/jobs/:id` | Delete job | Deletes an org job | Prisma | admin/owner | path/bodyless | not safe to queue blindly | n/a | LIVE | Add destructive-confirmation evidence in clients |
| API | `POST /api/jobs/:id/time-entries` | Start time entry | Creates time entry | Prisma | field roles | manual/schema | outbox | n/a | LIVE | Operator identity must come from session, not fallback |
| API | `PATCH /api/jobs/:id/time-entries/:entryId` | Stop/edit time entry | Field can close own entry; manager roles can edit | Prisma | field `{end}` or manager+ | manual/schema | outbox/idempotent opId | n/a | LIVE | Verify cross-job/entry ownership tests |
| API | `PATCH /api/jobs/:id/checklist-items/:itemId` | Checklist toggle | Persists checklist state | Prisma | field roles | schema/manual | outbox, state-idempotent | n/a | LIVE | Add unknown-field and row-scope tests |
| API | `POST /api/jobs/:id/photos` | Legacy photo creation | Creates job photo record | Prisma/media | field roles | manual | outbox | n/a | DEGRADED | Verify this route is not used for new byte uploads |
| API | `DELETE /api/jobs/:id/photos/:photoId` | Delete photo | Deletes org-verified photo | Prisma | manager+ | path/bodyless | recoverable only before sync | n/a | LIVE | Source says parent job is org checked |
| API | `POST /api/jobs/:id/signoff` | Customer sign-off | Stores signature/sign-off with idempotency | Prisma | field roles | schema/manual | outbox/opId | n/a | LIVE | Test retry and signature limits |
| API | `POST /api/jobs/:id/events` | Arrival/departure event | Persists monotonic site events | Prisma | field roles | schema/manual | outbox/opId | n/a | LIVE | Verify timestamp/device policy |
| API | `POST /api/jobs/:id/notes` | Site note | Persists a job note | Prisma | field roles | body cap/manual | outbox/opId | n/a | LIVE | Test cap and duplicate opId |
| API | `POST /api/jobs/:id/payment-link` | Payment link | Creates Stripe Checkout/payment identity when provider is configured | Stripe + Prisma | field/office per route | body/amount contract | queue only if server supports retry | n/a | BROKEN | Verify server computes amount from authoritative quote/job data; client amount is a release blocker if still accepted |

## Media, documents, RFIs, and notifications

| Surface | Route | Element/action | Current behaviour | Backend call(s) | Auth/role | Validation | Offline | A11y | Status | Fix / evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| API | `GET /api/documents` | Document register | Lists org/job documents | Prisma | field roles | query parser/manual | local cache | n/a | LIVE | Verify sensitive document row scope |
| API | `POST /api/documents` | Create document | Creates vault record, supports opId | Prisma | field roles | body parser/manual | outbox/opId | n/a | LIVE | Requires real media completion first |
| API | `PATCH /api/documents/:id` | Edit document | Updates document metadata | Prisma | office roles | body parser/manual | queue only if client supports | n/a | LIVE | Add schema/row-scope tests |
| API | `POST /api/documents/:id/versions` | Add document version | Adds version to vault | Prisma/media | field roles | body parser/manual | outbox | n/a | LIVE | Verify signed upload prerequisite |
| API | `DELETE /api/documents/:id` | Delete document | Removes document | Prisma | office roles | path/bodyless | destructive; no blind queue | n/a | LIVE | Client confirmation/evidence required |
| API | `POST /api/media/upload-intents` | Request upload | Returns signed upload intent | storage adapter + Prisma | tech/office | content-type/size checks | queue intent metadata | n/a | LIVE | Real bucket credentials still an owner action |
| API | `POST /api/media/:assetId/complete` | Complete upload | Finalizes media/document asset | storage + Prisma | tech/office | body parser/manual | outbox | n/a | LIVE | Verify upload bytes and provider response |
| API | `GET /api/media/:assetId/file` | Open media | Serves/redirects media URL | storage adapter | authenticated org member | path | cached read | n/a | DEGRADED | Capability URL is documented as long-lived; Phase 9 needs expiring signed reads/revocation |
| API | `GET /api/jobs/:jobId/rfis` | RFI list | Lists job RFIs | Prisma | field roles | path | local cache | n/a | LIVE | Verify row scope |
| API | `POST /api/jobs/:jobId/rfis` | Create RFI | Persists RFI | Prisma | field roles | body parser/manual | outbox | n/a | LIVE | Add schema tests |
| API | `PATCH /api/rfis/:id` | Update RFI | Persists RFI status/content | Prisma | field roles | body parser/manual | outbox | n/a | LIVE | Verify authorized job scope |
| API | `GET /api/notifications/status` | Notification status | Reads provider/status state | integrations | authenticated | bodyless | stale read state | n/a | LIVE | Provider state must be explicit |
| API | `GET /api/notifications` | Notifications | Lists notifications | Prisma | notification authors/read roles | bodyless/query | local read cache | n/a | LIVE | Verify role matrix |
| API | `POST /api/notifications` | Create notification | Creates notification/outbox event | Prisma | notification authors | body parser/manual | outbox | n/a | LIVE | Verify delivery failure state |
| API | `POST /api/sms/eta` | On-my-way SMS | Sends through Twilio when configured, otherwise reports provider unavailable/test mode | Twilio adapter | current route gate must match field UX | schema | queue only with outbox | n/a | HONEST-UNWIRED | Resolve technician permission/product decision; no fake success |

## Customers, agreements, properties, quotes, and organizations

| Surface | Route | Element/action | Current behaviour | Backend call(s) | Auth/role | Validation | Offline | A11y | Status | Fix / evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| API | `GET /api/customers` | Customer directory | Lists first-class customers | Prisma | operational roles | query/bodyless | HQ query cache; field sync | n/a | LIVE | Verify PII row scope for technicians |
| API | `POST /api/customers` | Create customer | Creates customer | Prisma | operational roles | body parser/manual | no blind queue | n/a | LIVE | Add client form evidence |
| API | `GET /api/customers/:id` | Customer detail | Returns properties, jobs, agreements | Prisma | office roles in current record | path/bodyless | field currently may rely on synced job fallback | n/a | BROKEN | Field customer screen requires a technician-scoped, least-privilege contract or an explicit honest unavailable state |
| API | `PATCH /api/customers/:id` | Edit customer | Updates customer | Prisma | office roles | body parser/manual | no blind queue | n/a | LIVE | Add client mutation surface or mark absent |
| API | `GET /api/customers/:id/properties` | Properties | Lists customer properties | Prisma | operational roles | path | cache | n/a | LIVE | Verify access-code visibility |
| API | `POST /api/customers/:id/properties` | Add property | Creates property | Prisma | operational roles | body parser/manual | outbox if field writes are allowed | n/a | LIVE | Add row-scope tests |
| API | `PATCH /api/customers/:customerId/properties/:propertyId` | Edit property | Updates property | Prisma | office roles | body parser/manual | no blind queue | n/a | LIVE | Validate AU address/access-code rules |
| API | `GET /api/customers/:id/agreements` | Agreements | Lists customer service agreements | Prisma | office roles | path | cache | n/a | LIVE | Field portal contract still missing |
| API | `POST /api/customers/:id/agreements` | Create agreement | Creates agreement | Prisma | office roles | schema/manual | no client form | n/a | HONEST-UNWIRED | CRM UI is read-oriented; add mutation only in later phase |
| API | `PUT /api/customers/:customerId/agreements/:agreementId` | Update agreement | Updates agreement fields | Prisma | office roles | schema/manual | no client form | n/a | HONEST-UNWIRED | Add visible mutation workflow and tests |
| API | `GET /api/quotes` | Quote list | Lists office quote pipeline | Prisma | office/accounting roles | bodyless/query | HQ cache | n/a | LIVE | Verify PII/row scope |
| API | `POST /api/quotes` | Create quote | Persists quote | Prisma | office/accounting roles | body parser/manual | no blind queue | n/a | LIVE | Add all-field schema coverage |
| API | `GET /api/quotes/:id` | Quote detail | Reads quote | Prisma | authenticated; field row scope requires decision | path | field sync/cache | n/a | LIVE | Verify technician assignment scope |
| API | `PATCH /api/quotes/:id` | Send/approve quote | Persists quote status | Prisma | office/accounting roles | body parser/manual | HQ rollback/outbox | n/a | LIVE | Verify server transition rules |
| API | `DELETE /api/quotes/:id` | Delete quote | Deletes quote | Prisma | manager+ | path | destructive/no blind queue | n/a | LIVE | Confirmation/e2e required |
| API | `POST /api/quotes/:id/lines` | Add quote line | Persists line | Prisma | office/accounting roles | body parser/manual | no blind queue | n/a | LIVE | Price authority and cents validation required |
| API | `PATCH /api/quotes/:id/lines/:lineId` | Edit quote line | Persists line | Prisma | office/accounting roles | body parser/manual | no blind queue | n/a | LIVE | Add GST/cents tests |
| API | `DELETE /api/quotes/:id/lines/:lineId` | Delete quote line | Deletes line | Prisma | office/accounting roles | path | destructive/no blind queue | n/a | LIVE | Add mutation contract test |
| API | `GET /api/organizations` | Organization list | Reads caller-visible organizations | Prisma | authenticated | bodyless | cache | n/a | LIVE | Verify no cross-tenant leakage |
| API | `GET /api/organizations/:id` | Organization detail | Reads organization | Prisma | authenticated | path | cache | n/a | LIVE | Must enforce membership |
| API | `POST /api/organizations` | Create organization | Creates organization | Prisma | admin/owner | body parser/manual | no | n/a | LIVE | Add schema/role tests |

## Routing, fleet, sync, stream, integrations, Slack, setup, and webhooks

| Surface | Route | Element/action | Current behaviour | Backend call(s) | Auth/role | Validation | Offline | A11y | Status | Fix / evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| API | `POST /api/fleet/telemetry` | Location telemetry | Records permitted tracking-mode telemetry | Prisma/audit | technician/session | schema | outbox/reconnect | n/a | LIVE | Must remain inside selected shift mode; no background tracking |
| API | `POST /api/fleet/location-consent` | Select tracking mode | Records self-attributed consent | Prisma/audit | authenticated org member | schema | outbox | n/a | LIVE | Owner policy is binding |
| API | `GET /api/routes/today` | Technician route | Returns assigned route/geometry | Prisma/haversine | route roles | query/bodyless | local route cache | n/a | LIVE | Verify tombstones/reconnect |
| API | `GET /api/routing/shape` | Road shape | ORS proxy or fallback route geometry | routing provider/cache | office | query parser | cached route | n/a | DEGRADED | Label straight-line fallback honestly; provider key needed for road routing |
| API | `GET /api/routing/matrix` | Travel matrix | Returns route matrix | routing provider/cache | office | query parser | cached route | n/a | DEGRADED | Provider availability and rate limits need live evidence |
| API | `GET /api/routing/geocode` | Geocode address | Proxies geocoding provider | provider/cache | field roles | query parser | cached result | n/a | LIVE | External provider dependency |
| API | `GET /api/routing/reverse` | Reverse geocode | Proxies reverse geocoder | provider/cache | field roles | query parser | cached result | n/a | LIVE | External provider dependency |
| API | `GET /api/routing/isochrones` | Reachability ring | Returns isochrone | provider/cache | office | query parser | cached result | n/a | HONEST-UNWIRED | Requires provider credential and live verification |
| API | `POST /api/routing/snap` | Snap point | Snaps location to road | provider/cache | office | schema/query | cached result | n/a | LIVE | Verify upstream allowlist |
| API | `POST /api/routing/optimize` | Optimize stops | Orders route stops | provider/cache | office | schema/query | no blind queue | n/a | LIVE | Verify it does not imply continuous tracking |
| API | `GET /api/sync` | Field pull sync | Returns changes and CRM/job fields | Prisma | authenticated session | query parser | local DB + cursor | n/a | LIVE | Tombstone completeness remains a Phase 6 task |
| API | `GET /api/stream` | Live stream | WebSocket/event stream with session token | stream/session | authenticated session | token/session | reconnect/backoff | n/a | LIVE | Revocation heartbeat must be verified |
| API | `GET /api/integrations` | Integration list | Reads provider connection state | Prisma | authenticated | bodyless | cached read | n/a | LIVE | Explicit provider states |
| API | `GET /api/integrations/deliveries` | Delivery log | Lists integration deliveries | Prisma | authenticated | query parser | cached read | n/a | LIVE | Verify field-role visibility |
| API | `GET /api/integrations/health` | Delivery health | Returns pending/failed/dead-letter counts | Prisma | authenticated | bodyless | cached read | n/a | LIVE | Provider state is data-derived |
| API | `POST /api/integrations/deliveries/:id/retry` | Retry delivery | Retries an integration delivery | Prisma/worker | office | path | queue retry | n/a | LIVE | Verify idempotency |
| API | `POST /api/integrations/:provider/test` | Test integration | Calls configured provider/test adapter | provider adapter | office/setup roles | schema | no | n/a | LIVE | Must report unconfigured provider honestly |
| API | `POST /api/integrations/:provider/api-key` | Save API key | Persists encrypted provider credential | Prisma/encryption | admin/owner | schema | no | n/a | LIVE | Verify secret never returned/logged |
| API | `GET /api/integrations/:provider/oauth/start` | Start OAuth | Redirects to provider | provider OAuth | manager+ | query parser | no | n/a | LIVE | Requires provider credentials |
| API | `GET /api/integrations/oauth/callback/:provider` | OAuth callback | Stores provider connection | provider OAuth | callback state | query parser | no | n/a | LIVE | Verify state/tenant binding |
| API | `POST /api/integrations/:provider/interest` | Register interest | Records unavailable integration interest | Prisma | authenticated/setup | bodyless | queue if needed | n/a | HONEST-UNWIRED | Appropriate for unconfigured Xero/MYOB |
| API | `DELETE /api/integrations/:provider` | Disconnect | Removes provider connection | Prisma | admin/owner | path | no blind queue | n/a | LIVE | Confirm credential revocation |
| API | `GET /api/slack/workspace` | Slack status | Reads real Slack workspace state | Slack/Prisma | office roles | bodyless | cached read | n/a | LIVE | No device-session channel history |
| API | `GET /api/slack/oauth/url` | Slack connect URL | Returns provider authorize URL | Slack OAuth | manager+ | bodyless | no | n/a | LIVE | Requires Slack client credentials |
| API | `GET /api/slack/oauth/callback` | Slack OAuth callback | Completes connection | Slack OAuth | authenticated/state | query parser | no | n/a | LIVE | Verify state/tenant binding |
| API | `POST /api/slack/workspace` | Save Slack workspace | Persists connection | Prisma/encryption | admin/owner | schema/manual | no | n/a | LIVE | Secret handling evidence required |
| API | `DELETE /api/slack/workspace` | Disconnect Slack | Removes connection | Prisma | admin/owner | bodyless | no | n/a | LIVE | Verify downstream worker cleanup |
| API | `GET /api/slack/routes` | Slack automation routes | Lists routing rules | Prisma | office roles | bodyless | cached read | n/a | LIVE | Includes `job.message_posted`; urgency emitter remains a gap |
| API | `PUT /api/slack/routes/:eventType` | Edit route | Persists routing rule | Prisma | manager+ | schema/manual | no blind queue | n/a | LIVE | Verify event allowlist |
| API | `DELETE /api/slack/routes/:eventType` | Remove route | Deletes routing rule | Prisma | manager+ | path | no | n/a | LIVE | Add mutation test |
| API | `GET /api/slack/channels` | Channel list | Reads Slack channels through provider | Slack API | office roles | bodyless | cached read | n/a | LIVE | Device sessions must remain denied |
| API | `GET /api/slack/channels/:channelId/messages` | Channel messages | Reads Slack channel history | Slack API | office roles | path | cached read | n/a | LIVE | Security-critical row/role test |
| API | `GET /api/slack/events/status` | Slack event status | Public health/status response | app state | open | bodyless | n/a | n/a | LIVE | Must not leak secrets |
| API | `POST /api/slack/events` | Slack event webhook | Verifies HMAC and processes events | Slack Events API | signature | raw body/HMAC | provider retry/dedupe | n/a | LIVE | Verify replay window and tenant mapping |
| API | `POST /api/webhooks/stripe` | Stripe webhook | Verifies signature and reconciles payment state | Stripe/Prisma | signature | raw body/HMAC | provider retry/idempotent | n/a | LIVE | Re-test after deployment with real Stripe event |
| API | `GET /api/setup` | Setup state | Reads onboarding state | Prisma | authenticated owner/admin | bodyless | cached read | n/a | LIVE | Setup role gate |
| API | `PUT /api/setup/step` | Save setup step | Persists onboarding answers | Prisma | owner/admin | schema/manual | queue only if designed | n/a | LIVE | Verify unknown fields and sensitive values |
| API | `POST /api/setup/launch` | Finish setup | Launches organization | Prisma | owner/admin | schema | no | n/a | LIVE | End-to-end setup evidence required |
| API | `GET /api/setup/abn/:abn` | ABN lookup | Calls Australian Business Register when configured | ABR provider | authenticated owner/admin | ABN regex | no | n/a | HONEST-UNWIRED | Requires `ABR_GUID`; no fake result |
| API | `GET /api/health` | Health check | Returns service health | process | open | none | n/a | n/a | LIVE | Does not prove database/provider health unless included |

---

# 2. HQ web inventory — `apps/hq`

The active surface is `CrewlineWorkspace`; legacy shell paths remain internal/compatibility routes and must not render duplicate chrome. Controls below are grouped when every repeated row/card uses the same handler contract.

## Auth and static entry routes

| Surface | Screen/route | Element | Action it should perform | Current behaviour | Backend call(s) | Auth/role | Validation | Offline | A11y | Status | Fix / evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| HQ | `/login` | Email/password form | Authenticate operator | Submits real login and redirects | `POST /api/auth/login` | public | client required fields + server schema | no | labelled inputs, errors | LIVE | `app/login/page.tsx` |
| HQ | `/login` | Station-token form | Development station auth only | Calls bootstrap session path | `POST /api/auth/hq-session` | dev/shared secret | required token | no | labelled password/button | HONEST-UNWIRED | Phase 4 removal/replacement |
| HQ | `/signup` | Account form | Create business account | Submits real account request | `POST /api/auth/sign-up` | public | client/server | no | labelled inputs/errors | LIVE | `app/signup/page.tsx` |
| HQ | `/forgot-password` | Reset request form | Request reset email | Reports email/unconfigured result | `POST /api/auth/forgot-password` | public | client/server | no | labelled inputs/errors | HONEST-UNWIRED | Requires email provider for delivery |
| HQ | `/reset-password` | Reset form | Consume reset token | Submits real password reset | `POST /api/auth/reset-password` | public token | client/server | no | labelled inputs/errors | LIVE | route source |
| HQ | `/invite/[token]` | Invite accept form | Join organization | Accepts real invite and redirects | `GET/POST /api/invites/:token*` | public token | client/server | no | labelled inputs/errors | LIVE | route source |
| HQ | `/landing` | Section links, sign-in CTA | Navigate product landing/auth | Real anchors/navigation except any `#` placeholder | none | public | n/a | n/a | keyboard links | DEGRADED | Audit the remaining bare `href="#"` |

## Crewline shared shell and Dispatch

| Surface | Screen/route | Element | Action it should perform | Current behaviour | Backend call(s) | Auth/role | Validation | Offline | A11y | Status | Fix / evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| HQ | `/?surface=dispatch` | Five/six-surface rail | Change Dispatch, Map, Documents, Customers, Reports, Slack | URL-backed surface switch | local nuqs state | authenticated | allowed literal values | preserves URL | button labels/focus | LIVE | `CrewlineWorkspace.tsx` |
| HQ | shared header | Search/palette trigger | Open searchable jobs/crew command palette | Opens palette and filters real board data | board cache | authenticated | query input | cache | button/input labels | LIVE | `CrewlineWorkspace.tsx`, `Palette.tsx` |
| HQ | shared header | Date/today/copy-link controls | Set day or copy shareable URL | URL/local clipboard feedback | no server write | authenticated | date parser | local | labelled buttons | LIVE | Verify clipboard rejection state |
| HQ | shared header | Connection/reconnect control | Re-arm live board data | Reconnects query/socket | `GET /api/board`, stream | authenticated | no body | cached/demo fallback | status announced | LIVE | Demo mode must remain build-gated |
| HQ | shared header | Sign out | Revoke current session | Calls sign-out then navigates | `POST /api/auth/sign-out` | authenticated | no body | local cleanup | labelled button | LIVE | `CrewlineWorkspace.tsx` |
| HQ | Dispatch | Day/week/month controls | Change schedule composition | URL/local zoom state | no server write | authenticated | literal parser | local | pressed state | LIVE | `DispatchSurface.tsx` |
| HQ | Dispatch | Previous/next day | Navigate schedule date | URL date state | board query refresh | authenticated | ISO date | cached board | labelled buttons | LIVE | `DispatchSurface.tsx` |
| HQ | Dispatch | Crew filter/select/collapse | Filter and select technicians/jobs | Local selection | board query data | authenticated | text query | local | labelled controls | LIVE | `CrewTree.tsx` |
| HQ | Dispatch | Job card/queue row | Open inspector | Local selected job | no write | authenticated | job ID from data | local | button/keyboard | LIVE | `DispatchSurface.tsx` |
| HQ | Dispatch | Drag/drop and keyboard AssignControl | Assign job to technician/time | Optimistic snapshot with server response and rollback/offline op | `PATCH /api/jobs/:id/assignment` | office roles | server assignment schema | queued/retry/rollback | keyboard alternative | LIVE | Add browser evidence for conflict failure |
| HQ | Dispatch | Status controls | Change job status | Optimistic server mutation | `PATCH /api/jobs/:id` | office/field according to action | server schema | outbox/rollback | labelled status | LIVE | Verify every status transition |
| HQ | Dispatch | New job form | Create unassigned job | Real form in live mode; explicit unavailable in demo/no API | `POST /api/jobs` | office | client + server | no blind queue unless action supports | labelled errors | LIVE | `NewJobForm.tsx` |
| HQ | Inspector | Customer Call link | Dial customer | Uses job contact field if present | `tel:` | authenticated | URL encode/phone validation | local | link label | BROKEN | Prior audit found name used as phone; verify current `Inspector.tsx` |
| HQ | Inspector | Notify customer / On my way | Send ETA SMS | Calls API and shows provider response | `POST /api/sms/eta` | current office gate | schema | no fake success; queue decision needed | status/error text | HONEST-UNWIRED | Requires Twilio + technician policy decision |
| HQ | Inspector | Job message thread | Read/post job thread | Real API thread with Slack provenance | `GET/POST /api/jobs/:id/messages` | authenticated | body schema | refresh/retry | labelled composer | LIVE | `JobMessageThread.tsx` |
| HQ | Inspector | Evidence/media open | Open field evidence | Real media URL or explicit no-storage state | `GET /api/media/:id/file` | authenticated | media ID | cache | link/button | DEGRADED | Expiring URLs remain open |
| HQ | Inspector | Failed-op retry/discard | Recover queued board mutation | Local outbox mutation state | retry API | authenticated | op ID | retry/discard | labelled actions | LIVE | Verify conflict message |

## Map, Documents, CRM, Reports, Slack, setup, and team screens

| Surface | Screen/route | Element | Action it should perform | Current behaviour | Backend call(s) | Auth/role | Validation | Offline | A11y | Status | Fix / evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| HQ | Map | Day navigation/today | Change mapped day | URL date + query | board/routes/routing APIs | authenticated office/route role | ISO date | cached map | labelled buttons | LIVE | `MapSurface.tsx` |
| HQ | Map | Crew panel | Open/select crew and map route | Local selection with real board members | board data/routing | authenticated | member/job IDs | cached | labelled buttons | LIVE | privacy-safe marker policy retained |
| HQ | Map | Job marker/stop | Select job/open inspector | Local selection | no write | authenticated | data-derived IDs | cached | focusable marker buttons | LIVE | map accessibility region present |
| HQ | Map | Reach/route controls | Request route/isochrone data | Calls real routing endpoints; fallback is labelled | `/api/routing/*` | office | query/schema | cached/fallback | status label | DEGRADED | Provider key and road-vs-straight evidence required |
| HQ | Map | Retry/unavailable control | Retry map style/provider | Resets ladder/error state | map provider | authenticated | no body | last known map | labelled retry | LIVE | `MapLibreView.tsx` |
| HQ | Documents | Category/search/list rows | Filter/select documents | Real document query and local selection | `GET /api/documents` | field/office per API | query | cached/empty/error | rows/buttons | LIVE | `DocumentsSurface.tsx` |
| HQ | Documents | Download/view | Open stored document | Opens URL only when API returns one; otherwise explains missing storage | `GET /api/media/:id/file` | authenticated | media ID | cached | link label | HONEST-UNWIRED | Needs object storage/signed read evidence |
| HQ | Documents | Delete/edit affordances | Mutate vault | Current reference surface is primarily read-only; absent actions must not imply success | document mutation APIs | office | server schema | no blind queue | n/a | HONEST-UNWIRED | Add forms or remove affordances |
| HQ | CRM | Customer search/list row | Select live customer | Reads API directory, not fabricated customers | `GET /api/customers` | operational roles | query | query cache/empty/error | labelled input/rows | LIVE | `CrmSurface.tsx` |
| HQ | CRM | Agreement panel | Display due/expired agreements | Reads customer agreement endpoint | `GET /api/customers/:id/agreements` | office roles | customer ID | cached/error | status icon+label | LIVE | Agreement mutations not yet exposed in surface |
| HQ | CRM | Job history | Show customer jobs | Current code/readiness may still match by name in compatibility fallback | board/customer data | authenticated | customer ID needed | cached | rows | BROKEN | Replace/verify name match with `customerId` |
| HQ | CRM | Agreement create/edit | Maintain service agreement | No complete visible mutation workflow | `POST/PUT /api/customers/:id/agreements` | office | server schema | no | n/a | HONEST-UNWIRED | Phase 3 UI work |
| HQ | Reports | Summary/table/filter | Calculate and display live job metrics | Reads board data and computes display values | `GET /api/board` | authenticated | date/number formatting | cached/error | table headers | LIVE | Verify estimates and currency are labelled |
| HQ | Reports | Create payment link | Create Stripe Checkout | Calls payment route with client value in current risk record | `POST /api/jobs/:id/payment-link` | field/office route gate | amount/schema | no fake link | status/error | BROKEN | Server authority and Stripe credentials must be verified |
| HQ | Slack | Connect/disconnect | OAuth connect or remove workspace | Real provider flow/state | Slack OAuth/workspace APIs | manager/admin | provider/state validation | no | labelled controls | LIVE | `SlackSurface.tsx` |
| HQ | Slack | Channel/messages | Read channels and messages | Real Slack proxy for office roles | Slack channel APIs | office only | channel IDs | cached/error | selectable list | LIVE | Device access must remain denied |
| HQ | Slack | Routing editor | Save/delete automation routes | Real API mutation | Slack routes APIs | manager+ | event/channel schema | no blind queue | labelled select | LIVE | Verify `job.status_urgent` has no false promise |
| HQ | Comms drawer | Slack cards/accept/rewrite | Show and mutate Slack work | Local feed path can simulate cards/claim progression | none or local store | authenticated | local only | local | labelled controls | FAKE | Remove/replace `slackBridge` path; do not show local success as Slack delivery |
| HQ | Crews/team | Role/skill/remove/invite/device controls | Manage members and sessions | Real team/auth APIs | team/auth routes | owner/admin gates | server schema | no blind queue | labelled select/buttons | LIVE | `TeamRoster.tsx` |
| HQ | Setup | Wizard choices/steps | Save onboarding and launch org | Real setup APIs | setup/integrations APIs | owner/admin | client + server | no blind queue | labels/progress | LIVE | `SetupWizard.tsx` |
| HQ | Setup | Integration test/OAuth/disconnect/interest | Connect configured providers or show unavailable | Integration APIs | provider-specific roles | client + server | no | labelled controls | LIVE / HONEST-UNWIRED | Provider credentials remain external owner actions |

---

# 3. Field agent inventory — `my-mobile-app/src`

Routes found under `src/app`: root layout/error boundary, tab shell (`Jobs`, `Map`, `Profile`, `Comms`), `job/[id]`, `customer/[id]`, `documents`, `thread/[id]`, and HTML export root. Native and web route implementations differ where `RouteMap.native.tsx` is selected.

## Enrollment, shell, and jobs

| Surface | Screen/route | Element | Action it should perform | Current behaviour | Backend call(s) | Auth/role | Validation | Offline | A11y label/role | Status | Fix / evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Field | Root/layout | Error boundary retry | Retry failed route/tree | Re-renders route | local | none after auth | n/a | local | button label | LIVE | `src/app/_layout.tsx` |
| Field | Enrollment / sign-in gateway | Operator email/password/token | Sign in operator | Calls account auth/session | `POST /api/auth/login`, session | public/session | form checks/server schema | no | labelled inputs | LIVE | `SignInGateway.tsx`; verify production enrollment path |
| Field | Enrollment / PinPad | PIN digits/backspace/submit | Unlock local operator | Local device-bound PIN flow | local secure storage | device-local | PIN rules | local | labelled buttons | LIVE | `PinPad.tsx` |
| Field | Setup gateway | Tracking mode choice/continue | Select shift tracking or clock points and continue | Persists selected mode and consent | `POST /api/fleet/location-consent` | authenticated self | schema | outbox/retry | labelled choices | LIVE | `SetupGateway.tsx` |
| Field | Clock-in gateway | LOG ON | Capture shift start/location and enter app | Real clock-in/shift state; identity/config fallback risks remain | time entry/telemetry APIs | authenticated technician | time/location validation | outbox/retry | labelled button + disclosure | DEGRADED | `ClockInGateway.tsx`; verify real device operator identity |
| Field | Clock-in gateway | Pin setup | Set/change local PIN | Local secure storage | none | authenticated device | PIN rules | local | labelled | LIVE | `ClockInGateway.tsx`, `PinSetupScreen.tsx` |
| Field | Install prompt | Install/dismiss | Install PWA or dismiss | Browser install prompt path | browser API | public | n/a | local | labelled buttons | LIVE | `InstallPrompt.tsx` |
| Field | Jobs tab `/` | Job cards | Open job detail | Opens synced technician jobs | local `/job/[id]` | signed-in technician | job ID | local DB | labelled card/button | LIVE | `src/app/(tabs)/index.tsx` |
| Field | Jobs tab | Pull refresh | Pull API changes | Runs sync manager | `GET /api/sync` | bearer session | cursor | offline retry | refresh state | LIVE | `db/sync.ts` |
| Field | Jobs tab | Connection/sync badge | Open outbox details | Shows queued/failed state | local; retry calls outbox handlers | signed-in operator | n/a | retry/discard | labelled status button | LIVE | `SyncBadge.tsx`, `SyncSheet.tsx` |
| Field | Job detail `/job/[id]` | Back/customer/phone/thread | Navigate to related screens | Uses router/deep links and `tel:` | customer/messages reads | signed-in technician | route IDs | local cache | labelled buttons/links | LIVE / DEGRADED | Customer API role scope must be verified |
| Field | Job detail | On My Way preview/send/retry/cancel | Send real ETA message | Current source has local sent flag; app/API wiring and technician gate do not match | expected `/api/sms/eta` | current API excludes field role | message/ETA schema | must queue or show unavailable | button labels | FAKE / BROKEN | Remove local success; wire approved provider path or honest unavailable state |
| Field | Job detail | Checklist rows | Toggle checklist item | Persists item state through outbox | `PATCH /api/jobs/:id/checklist-items/:itemId` | field role | item schema | queued/idempotent | checkbox role/state | LIVE | `job/[id].tsx`, `fieldActions.ts` |
| Field | Job detail | Start/stop clock | Start/close time entry | Writes real time entry | `POST/PATCH /api/jobs/:id/time-entries*` | field role | time schema | outbox/opId | labelled button/state | LIVE | Operator/staff identity fallback must be removed |
| Field | Job detail | Price-book rows/quantity/remove | Build invoice lines | Local hardcoded price book and local totals | none | signed-in technician | qty/price local | lost on reload | labelled steppers | PLACEHOLDER | Fetch authoritative price book and persist quote/invoice |
| Field | Job detail | Send invoice | Send invoice/payment request | Local `invoiceSent`/job patch path; no invoice entity contract | expected invoice/payment API | role/provider unresolved | client totals only | no | status/error | FAKE | Build invoice entity + Stripe/email/SMS path |
| Field | Job detail | Capture/review/use photo | Capture and upload evidence | Camera/library + signed upload/outbox; photo path historically sends base64 text | upload intent/PUT/complete | field role | media type/size | queued/retry/discard | labelled buttons/sheet | BROKEN | Verify current byte conversion; document path is separate and known-good |
| Field | Job detail | Photo retry/discard | Recover failed evidence | Local outbox recovery | upload APIs on retry | field role | asset ID | retry/discard | labelled | LIVE | Verify no data loss |
| Field | Job detail | Arrival/departure | Persist site event | Outbox event path | `POST /api/jobs/:id/events` | field role | event schema | queued/idempotent | labelled buttons | LIVE | Monotonic server semantics |
| Field | Job detail | Signature pad/review | Store customer sign-off | Outbox sign-off | `POST /api/jobs/:id/signoff` | field role | signature schema | queued/idempotent | drawing labels/buttons | LIVE | `SignaturePad.tsx` |
| Field | Job detail | Complete job/confirm/cancel | Complete with evidence readiness | Local readiness + outbox job status | `PATCH /api/jobs/:id` | field role | server status/signature | queued/retry/recoverable | modal/button labels | LIVE | Verify end-to-end status response |
| Field | Job detail | Notes/auto-generated note | Persist site note | Note action/outbox | `POST /api/jobs/:id/notes` | field role | 2000-char cap | queued/idempotent | labelled input | LIVE | Verify generated note is not sent twice |

## Communications, customer, documents, map, and profile

| Surface | Screen/route | Element | Action it should perform | Current behaviour | Backend call(s) | Auth/role | Validation | Offline | A11y label/role | Status | Fix / evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Field | Comms tab `/comms` | Thread rows/unread badge | Open job thread | Reads real thread summaries | `GET /api/messages/threads` | signed-in technician | bodyless | local cache/live stream | labelled rows | LIVE | `comms.tsx` |
| Field | Thread `/thread/[id]` | Back/job link | Navigate | Local/router | no write | signed-in technician | route ID | local | labelled | LIVE | `thread/[id].tsx` |
| Field | Thread | Composer/send | Post field message | Outbox idempotent message | `POST /api/jobs/:id/messages` | field direction guard | body schema/opId | queued/retry | labelled composer/button | LIVE | `MessageComposer.tsx` |
| Field | Customer `/customer/[id]` | Call/text/email | Open device contact action | Uses real record data when present | `tel/sms/mailto` | signed-in technician | URL encoding | local | labelled buttons | LIVE | Disabled without contact data |
| Field | Customer | Customer fetch/history | Show API customer/properties/agreement/history | API route is office-gated; mobile may fall back to synced job data | `GET /api/customers/:id` | current mismatch | route ID | local fallback | loading/empty/error needed | BROKEN / DEGRADED | Add least-privilege technician read or honest denial |
| Field | Customer | History row | Open synced job | Opens local job only | local route | signed-in technician | job ID | local | labelled row | DEGRADED | Fetch permitted job detail if not synced |
| Field | Documents `/documents` | Back/filter/list/row | Browse document register | Real API list, local selection | `GET /api/documents` | field role | query/job ID | local cache/empty/error | labelled rows | LIVE | `documents.tsx` |
| Field | Documents | Capture photo/library/category/save | Upload document | Signed upload bytes + document outbox | upload intent/complete + `POST /api/documents` | field role | category/media validation | queued/retry | labelled sheet/buttons | LIVE | Verify provider credentials |
| Field | Documents | Open file | View document | Opens signed/storage URL or explains unavailable | `GET /api/media/:id/file` | authenticated | asset ID | cached | labelled link | DEGRADED | Signed URL expiry missing |
| Field | Map `/map` | Map pins/job open | Show own jobs and open detail | MapLibre/native route map | sync data/map tiles | signed-in technician | coordinates | cached map | marker labels/buttons | LIVE / DEGRADED | Verify native pins and provider fallback |
| Field | Map | Enable location | Request current location | Device permission/location call | native geolocation | technician | permission state | no | labelled button/disclosure | LIVE | Must respect selected mode |
| Field | Map | Go/navigate | Open external navigation | `Linking` deep link | external maps app | local | coordinates | local | labelled | LIVE | Verify missing-coordinate state |
| Field | Profile | Theme toggle | Change colourway | Local preference | local | signed-in operator | boolean | local | switch label/state | LIVE | Test contrast both modes |
| Field | Profile | Clock out/confirm | End shift and capture endpoint | Shift actor + telemetry off-shift | time entry/fleet APIs | technician | confirmation | outbox/retry | labelled modal/buttons | LIVE | Verify durable reload state |
| Field | Profile | Break start/end | Pause/resume shift tracking | Local shift actor + telemetry policy | fleet telemetry as allowed | technician | state machine | outbox/retry | labelled state | LIVE | No background tracking outside shift |
| Field | Profile | Tracking mode choices | Change consent mode | Local + consent API | `POST /api/fleet/location-consent` | authenticated self | schema | outbox | labelled radio state | LIVE | Policy is owner-locked |
| Field | Profile | Vehicle edit/save/cancel | Persist operator vehicle | Current client path may be local-only | expected team/profile API | role/provider unresolved | vehicle schema | local or queued | labelled form | HONEST-UNWIRED | Confirm server endpoint before claiming persistence |
| Field | Profile | PIN set/change/remove | Manage local PIN | SecureStore/local storage | local | device-local | PIN rules | local | labelled buttons | LIVE | Verify secure native storage |
| Field | Profile | Sync/outbox sheet | Retry/discard failures | Local outbox recovery | individual API handlers | signed-in operator | op IDs | retry/discard | labelled | LIVE | Verify all op kinds |
| Field | Profile | Sign out | Revoke session | Real sign-out | `POST /api/auth/sign-out` | authenticated | no body | local cleanup | labelled | LIVE | Verify session is unusable after sign-out |
| Field | Profile | Payable-so-far | Display award estimate | Local calculation with configured/fallback rate | none | local | monetary formatting | local | labelled data | DEGRADED | Rate must come from org configuration, not fallback constants |
| Field | App shell | Live stream | Receive updates/reconnect | WebSocket stream | `/api/stream?token=` | authenticated session | reconnect/backoff | status announced | LIVE | Demo simulator must be unreachable in production |

## Field-agent non-screen infrastructure surfaced by the walk

| Area | Element/action | Current behaviour | Backend call(s) | Offline | Status | Evidence / Phase task |
|---|---|---|---|---|---|---|
| Auth | Device enrollment/bootstrap | Shared public bootstrap path exists in code/history | `/api/auth/device` | retry | HONEST-UNWIRED | Phase 4 per-operator identity/device binding |
| Config | API/org/operator/rate defaults | Constants contain localhost/org/staff/rate fallbacks | none | local | PLACEHOLDER | Phase 2 fail loudly on missing `EXPO_PUBLIC_*`; remove production fallback |
| Demo | Demo data/stream scripts | Gated by demo flag in source | none | local | HONEST-UNWIRED | Add bundle grep/tree-shaking proof in CI |
| Sync | Watermelon pull/push | Pull and outbox handlers exist | `/api/sync` plus write routes | retry/idempotent | LIVE | Add tombstones and v4→v5 migration device proof |
| Native | RouteMap native/web split | Native and web implementations differ | map provider | cache/fallback | DEGRADED | Run native smoke build; verify pins and touch targets |

---

# 4. Missing surface inventory

## Customer portal

The design spec defines a standalone customer portal with its own magic-link auth, booking/quote approval/payment/history views, and customer-facing progress language. No `apps/portal`, portal route tree, auth contract, or deployed portal is present in this workspace.

| Surface | Screen/route | Element | Current behaviour | Backend call(s) | Status | Fix / evidence |
|---|---|---|---|---|---|---|
| Portal | all planned routes | magic-link auth, booking, quote approval, payment, job history, ETA | no implementation in repository | none | PLACEHOLDER | Phase 3/4 must define separate app/auth; do not bolt onto HQ |

---

# 5. API and client contract tasks generated from this inventory

## Phase 2 — hardcoded placeholders

- Replace field-agent identity (`Dave`, `Dave Mitchell`, `staff-1`, `van-1`) with signed-in operator/session data.
- Remove production-reachable localhost/org/rate fallbacks; fail loudly on missing `EXPO_PUBLIC_*` configuration.
- Remove or gate any HQ local Slack-card simulation; verify no simulated Slack state enters production bundle.
- Require configured `HQ_APP_URL` instead of a deployment fallback.
- Keep HQ seed data behind explicit dev/test flags and verify bundle output.

## Phase 3 — wiring and provider contracts

- Replace field-agent On My Way local success with a real, role-approved SMS outbox path or an explicit unavailable state.
- Build authoritative price-book/invoice/payment contracts; never accept client-computed payment amount as authority.
- Verify and fix photo upload bytes end to end.
- Make CRM history use `customerId`, not display-name matching.
- Add technician-safe customer/agreement read contracts or remove unsupported mobile CRM claims.
- Verify all HQ board writes round-trip and rollback, including quote/status/SMS actions.
- Decide whether `job.status_urgent` is a real emitted event or remove it from the Slack routing UI.

## Phase 4 — auth and authorization

- Replace shared bootstrap identity with real per-operator sessions/device binding and revocation.
- Write `docs/audit/ROLE_MATRIX.md` from the route table and enforce row scope (jobs, customers, quotes, documents, threads, Slack).
- Add table-driven cross-tenant and cross-role route tests.

## Phase 5 — validation and AU formats

- Put every API body/query through shared Zod validation with unknown-field rejection and length caps.
- Enforce E.164 phone numbers, Australian postcodes, ABN checksum, ISO dates, integer cents, GST 10%, and accessible client-side field errors.

## Phase 6 — offline/sync

- Put every field write through the outbox with stable opId, retry/discard/recovery state.
- Add sync tombstones and prove schema v5 migration from v4 on a device.
- Verify reload/reconnect reconciliation and live-stream revocation.

## Phase 7 — accessibility

- Run axe/Playwright against every HQ route and native/web field screen.
- Verify labels, focus order, keyboard drag/drop, 44px touch targets, reduced motion, text scaling, and AA contrast in both themes.

## Phase 8–11 — operational/product work

- eForms/PDF/regulator fields, expiring media reads, SMS spend caps, PII retention/erasure, metrics/alerting, portal, native release prep, EAS/dev-client and notification credentials.

---

# 6. Evidence and limitations

- Source evidence: current route trees and interactive-handler searches on 2026-09-20.
- Reference evidence: `HANDOVER.md`, `AGENTS.md`, and `PRODUCTION_READINESS.md`; these contain dated live checks and known gaps but are not a substitute for a new deployment smoke test.
- Preview evidence from this thread: HQ at `http://localhost:3001/` renders Dispatch and Map in demo fallback; this does not prove production authentication, provider connectivity, native rendering, or real database writes.
- No customer portal evidence exists because the surface is not implemented.
- No production database migration, provider credential, deployment, or push was performed in Phase 1.

**Phase 1 exit condition:** inventory written. Stop here for review; do not begin Phase 2 until explicitly approved.
