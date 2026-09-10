# FieldLoop — Handover (2026-09-11)

One-page handoff for whoever picks this up next (human or agent). The
standing operational traps live in AGENTS.md; the readiness register lives
in PRODUCTION_READINESS.md; the design baseline lives in docs/design/.

## Live surfaces (all SUCCESS, verified via deployed artifacts)

| Surface | URL | Code |
|---|---|---|
| FSM field agent (technician) | https://web-production-364b4f.up.railway.app | bushintel77-star/plumbtrack-mobile `master` (local: `my-mobile-app/`) |
| Dispatch console (HQ) | https://hq-production-7911.up.railway.app | monorepo `apps/hq` |
| API | https://api-production-363e.up.railway.app | monorepo `apps/api` |
| Postgres | Railway internal | 16 migrations applied (latest `20260910030000_job_quote_link`) |

Deploy rule: `railway up -s <svc> -c -y` **from the right directory**
(monorepo root for api/hq; `my-mobile-app/` — which has its own railway
link — for the field agent), then CONFIRM with
`railway deployment list -s <svc>`. Exit 0 ≠ deployed.

## Shipped this engagement (PRs #7–#13 + plumbtrack-mobile commits)

- **Zero-mock pass**: fake Xero invoice sync and fake Stripe URL removed;
  seeds gated to dev/test in HQ + web + field agent; honest "not connected"
  states everywhere; prod misconfiguration (missing `NEXT_PUBLIC_*`/`EXPO_PUBLIC_*`,
  baked FORCE_DEMO) is loud — banner + console errors.
- **Security/integrity**: prod auth immutable (`PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER`
  can't disable bearer auth; prod refuses to boot with it); assignment
  advisory-lock transaction (double-booking was 9/10 reproducible); Slack
  HMAC v0 + fail-closed org scoping; **Stripe webhook rawBody fix** (Fastify 5
  never attaches request.rawBody — every real webhook 503'd); auth routes
  rate-limited 10/min/IP; renew can't mint 30-day sessions from 12h ones.
- **Field agent deployed** (was built but never shipped): env-inlining fix,
  bootstrap-token enrollment, SecureStore→localStorage web fallback, web
  export Dockerfile, white-screen root cause (unstable store selector →
  React #185) + route ErrorBoundary.
- **Quote→job automation**: Job.quoteId (migration `20260910030000`),
  org-validated create/PATCH, quote rides /api/jobs + /api/sync, AGREED WORK
  panel on the field agent — live-verified on J-1043.
- **HQ wired to real APIs**: CRM (customers + agreements + due verdicts),
  Documents (live register + downloads when a version has a URL), Payments
  (real Stripe Checkout links priced from quoted revenue).
- **One FSM + one dispatch**: apps/dispatch (Electron) and apps/web (draft
  PWA) deleted; HQ legacy kanban/calendar Board removed with its real
  capabilities (message thread, SMS ETA, evidence) ported into the FieldLoop
  inspector; SMS button now reads the provider response.
- **Tracking modes (owner decision 2026-09-11)**: two technician-selectable
  modes — SHIFT TRACKING (default; position shared while clocked on, paused
  on breaks, stopped at log-off) and CLOCK POINTS ONLY (one capture at
  clock-in + one at clock-out). Supersedes spec §8 point-in-time-only
  (banner recorded in docs/design/fieldloop-implementation-spec.md).
- **Automation**: site note auto-generates from arrival/departure + checklist
  + evidence and syncs to dispatch (mockup §3.3 "nothing to type" design).
- **Light colourway fixed**: uniwind compiled both :root/@variant blocks into
  one unscoped selector — tokens now live in plain .light/.dark scopes.

## Owner actions (not doable from here)

1. **Railway GitHub app**: auto-deploy dead since 2026-09-07 — reconnect in
   the Railway dashboard. Until then, deploys are manual (see deploy rule).
2. **STRIPE_WEBHOOK_SECRET** on the api service: payments stay dormant
   without it. After setting, send a test event from Stripe — should 200.
3. **Rotate HQ_BOOTSTRAP_TOKEN** (it was displayed in a chat session):
   `railway variable set -s api HQ_BOOTSTRAP_TOKEN=<new>`, same value in
   your password manager; redeploy not required for the variable itself.
4. **Device state**: the test device is CLOCKED ON (~9.5 h accrued) — LOG OFF
   in Profile to close the time entry.
5. **Mimosa audit note**: the commit-hook scanner reports medium
   "suspected cross-file taint" on parameterized Prisma calls (jobs.ts,
   slack.ts, sms.ts, MapLibreView.tsx). Reviewed as false-positive pattern
   (ORM parameterization), but a full unhooked audit run was never completed.

## Backlog (agreed order)

- **P1**: Slack ↔ JobMessage bridge; `job.status_urgent` emitter (Job needs
  an urgency field); Slack user resolution; port anything else needed from
  apps/web history (recoverable); editable Slack automation-routing UI
  (spec §9).
- **P2**: customer portal (spec §5 — new standalone surface, magic-link
  auth); Invoice entity derived from accepted quotes (GST fields, billing
  history); agreement→job scheduler; sync tombstones.
- **Infra**: self-hosted map tiles (spec §7), real road-routing engine
  labels, rate-limit store for multi-instance.
