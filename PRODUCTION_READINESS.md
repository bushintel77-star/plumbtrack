# Production readiness — WIP and gap register

Updated: 2026-09-04 (after the production-hardening pass, commit `2de7c008`)

## Shipped state

| Area | State |
|---|---|
| API auth | Production sign-in live: HQ station token → 12h cookie session; legacy tenant header fails closed; webhooks signature-verified and exempt from the tenant hook. Still shared-secret (see P0-1). |
| Tenant isolation | Cross-tenant holes closed (checklist item, photo delete, quote line all org-scoped). |
| CORS | Fails closed in production (`CORS_ORIGINS` required at boot). |
| Field writes | Technicians can complete/sign jobs (`{status, signature}` only); metadata stays manager+. Web PWA persists sign-offs through the outbox; HQ offline queue drains assign ops correctly. |
| Roster | `GET /api/board` returns the org staff; HQ drag-to-assign validates real member ids. |
| Media | Signed S3 uploads; `publicUrl` from `PUBLIC_API_BASE_URL` (host-header spoofing closed). Capability URLs are long-lived (see P2-3). |
| Rate limits | Global 500/min/IP + SMS route 10/min/IP. |
| Observability | Sanitized 5xx bodies, `x-request-id` correlation, pino header redaction. No metrics/alerting yet (P1-5). |
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
