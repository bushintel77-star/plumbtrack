# Production readiness — WIP and gap register

Updated: 2026-09-08 (after the zero-mock / stress-test hardening pass, branch `prod-hardening-zero-mock`)

## 2026-09-08 hardening pass (stress-test driven)

Everything below was found by a live stress test + zero-mock audit and fixed on this branch:

- **Legacy auth override is dead in production.** `PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER` could disable bearer auth entirely even with `NODE_ENV=production` (live-demonstrated: full org board served with no credentials). Production now always requires signed sessions; a prod boot carrying the flag refuses to start. Flag removed from `apps/api/.env`.
- **Assignment double-booking fixed.** Two concurrent `PATCH /api/jobs/:id/assignment` calls double-booked a technician 9/10 rounds (conflict check + update outside a transaction). Now inside a per-technician advisory-lock transaction; regression test added.
- **Stripe webhook was silently broken.** Fastify 5 never attaches `request.rawBody`, so signature verification always 503'd on real webhooks — payment status never updated from Stripe. Raw body is now captured in the scoped parser; first signature tests added. Deploy requires **no** env change but Stripe endpoints should be re-verified after deploy.
- **Slack inbound: HMAC v0 verification** (`SLACK_SIGNING_SECRET`, ±300s replay window) with the legacy verification token as a logged fallback; unmapped Slack teams can no longer mutate jobs unscoped (fail-closed).
- **Session minting rate-limited** (`AUTH_RATE_LIMIT_MAX`, default 10/min/IP — was unlimited: 1,272 req/s of wrong-token guesses measured). `/auth/renew` can no longer extend a 12h HQ session to 30 days.
- **Read caps + indexes.** Board/jobs/sync/quotes/documents reads are capped (`apps/api/src/lib/limits.ts`); `[orgId, createdAt]`/`[orgId, updatedAt]` indexes added (`20260908090000_job_org_read_indexes`). Pull-sync cursor now resumes past the cap (was `Date.now()` — silently skipped changes on busy pulls).
- **Zero-mock pass (web + HQ).** Production builds contain no fabricated business data: web PWA boots empty (seed gated to dev/test), fake Xero invoice sync removed (honest "not connected"), fake Stripe checkout URL removed (honest error state), simulated GPS delay removed (real 10s fix window); HQ board seed gated to dev/test (production boots empty and hydrates live), Documents/Crm surfaces render only real data, dead `data/vault.ts` deleted. Misconfiguration is loud: missing `NEXT_PUBLIC_*` API URL or baked `FORCE_DEMO` in prod builds logs errors + shows a config banner.
- **HQ stale-Live badge fixed.** A live console that loses the API drops to "Connecting" instead of claiming "Live" over stale data; production keeps polling through the demo latch so outages self-heal.
- **`apps/dispatch` no longer built/tested by CI** (superseded prototype; `dev`/`start` kept).

## Shipped state

| Area | State |
|---|---|
| API auth | Production sign-in live: HQ station token → 12h cookie session; legacy tenant header dev/test-only (immutable in production); webhooks signature-verified and exempt from the tenant hook. Still shared-secret (see P0-1). |
| Tenant isolation | Cross-tenant holes closed (checklist item, photo delete, quote line all org-scoped); Slack inbound org-scoped fail-closed. |
| CORS | Fails closed in production (`CORS_ORIGINS` required at boot). |
| Field writes | Technicians can complete/sign jobs (`{status, signature}` only); metadata stays manager+. Web PWA persists sign-offs through the outbox; HQ offline queue drains assign ops correctly. |
| Roster | `GET /api/board` returns the org staff; HQ drag-to-assign validates real member ids. |
| Media | Signed S3 uploads; `publicUrl` from `PUBLIC_API_BASE_URL` (host-header spoofing closed). Capability URLs are long-lived (see P2-3). |
| Rate limits | Global 500/min/IP + SMS 10/min/IP + auth/session routes 10/min/IP. In-memory store — single-instance only (see P1 below). |
| Observability | Sanitized 5xx bodies, `x-request-id` correlation, pino header redaction. No metrics/alerting yet (P1 below). |
| Deploys | Railway: api/web/hq all deploy from `main`; api runs migrations via `preDeployCommand` (verified 2026-09-04). API image now runs non-root. |
| Branch protection | ON: `main` requires "Build, typecheck, lint and test"; force-push/deletion blocked; `enforce_admins` false (owner bypass in emergencies). |

## Blocking gaps to production completion

### P0 — must close before multi-operator live operations

1. **Per-operator auth** — sign-in is still shared bootstrap secrets (`HQ_BOOTSTRAP_TOKEN` owner session; public `DEVICE_BOOTSTRAP_TOKEN` enrollment). No per-user identity, no revocation, no lockout. Design project before onboarding a second org or operator.
2. **HQ e2e rewrite (release validation)** — the HQ Playwright suite (35/36 specs) targets the pre-FieldLoop shell (`nav-*` sidebar, `demo-badge`, `palette-trigger` — none exist in source). It cannot gate releases. Needs a rewrite against `FieldLoopWorkspace` + a CI job. The web PWA suite is the current CI e2e baseline.
3. **SMS/cost audit** — Twilio sends are role-gated and rate-limited, but there is no per-org spend cap or provider-side budget alert.

### P1 — required for a complete FSM loop

1. HQ CRM/quote/document surfaces still render seed data (only OperationsHub hits real endpoints).
2. HQ Slack comms + quote lifecycle are local simulations.
3. Media capability URLs never expire (`Cache-Control: immutable`); no revocation, no storage TTL.
4. ~~Map road geometry~~ CLOSED 2026-09-05: routing moved behind the authenticated `/api/routing/shape|matrix` proxy (server-side `ORS_API_KEY`, LRU cache; ORS-only — set the free key to enable road shapes, without it the map keeps straight-line dashed routes). Traffic overlay still needs a paid feed — the one remaining map item blocked on a provider account. Crew identity ramp extended to 8 tokens; self-hosted PMTiles tiles are one env var (`NEXT_PUBLIC_MAP_STYLE_URL`) once a style is hosted.
5. Metrics, alerting, and audit-event delivery guarantees (audit writes are fire-and-forget).
6. PII retention/erasure policy (customer phones, addresses, access codes are plaintext, unexpired).
7. Prisma connection pool sizing; interactive-transaction coverage for multi-step mutations.

### P2 — scale and polish

1. HQ mid-session expiry now redirects to sign-in (window event from the board poll), but the renew tick badge was removed with the legacy toolbar; session state is otherwise invisible.
2. HQ `NEXT_PUBLIC_HQ_DEV_ORG_ID` is misnamed but load-bearing (must equal the API org or every request 403s).
3. `apps/dispatch` is a superseded Electron prototype still built by CI (echo test, no deploy).
4. Container image digests, web-service healthcheck, IaC apply for the web service build pin.

## Acceptance criteria for declaring production-ready

- P0 items closed and demonstrated on a clean production start.
- No unauthenticated access to tenant data or mutations (met today; keep it green).
- Assignment and status mutations server-authoritative and auditable (met for jobs; quotes/docs still client-side).
- HQ e2e suite rewritten and wired to CI, running green against the FieldLoop shell.
- Deployment, rollback, and incident runbooks documented.

## Verified current checks (2026-09-04)

- Monorepo typecheck / lint / unit tests / build: green (API 160, HQ 93+1 e2e, web 80).
- Web PWA Playwright suite: wired to CI 2026-09-04.
- API deploy: preDeployCommand migrations verified on Railway.
