# PlumbTrack Codebase Audit — 2026-09-06

Full-inventory findings from a four-way parallel deep scan (HQ frontend, technician PWA, API, cross-cutting/workspace). Every finding was verified by reading the code; file:line refs are relative to repo root. Severity: **P0** = wrong results / security / deploys at risk · **P1** = major correctness, reliability or waste · **P2** = quality · **P3** = nit. Previously reported basemap-contrast findings are excluded (see earlier gap analysis).

---

## Priority index (top 10)

1. **[P0/env/deploy]** Prod web API URL is wired scheme-less and web never normalizes it → every prod sync request resolves as a relative path and 404s; the offline-first PWA silently falls back to demo/local data so nobody notices. `.railway/railway.ts:83` + `apps/web/src/lib/config.ts:63` (hq has `buildApiUrl`, web does not). Aggravated by a **root `Dockerfile` missing the entire `NEXT_PUBLIC_*` ARG block** while the web service's `dockerfilePath` is unpinned in IaC — if the root Dockerfile wins, the bundle builds with no env inlined.
2. **[P0/data-loss]** Technician PWA 5s poll merge (`MERGE_REMOTE`, `apps/web/src/state/reducer.ts:29-60`) wipes local-only daily reports, log entries, checklists, milestones, and pending photos whenever the API is reachable; loss is persisted to localStorage. Only `serviceItems`/`voiceNotes`/etc. are re-merged; `protectedJobIds` covers pending `update-job` ops only.
3. **[P0/security]** Device-enrollment secret ships in the public web bundle (`NEXT_PUBLIC_DEVICE_BOOTSTRAP_TOKEN`, `apps/api/Dockerfile:38`, `.railway/railway.ts:73`): anyone can `POST /api/auth/device` and mint a 30-day technician session — clock time, upload photos, sign off jobs, create Stripe payment links (`apps/api/src/routes/auth.ts:53-110`).
4. **[P1/security]** `DELETE /api/quotes/:id/lines/:lineId` skipped the org-scoping fix its PATCH sibling received — cross-tenant quote-line destruction (`apps/api/src/routes/quotes.ts:144-156` vs `:128`).
5. **[P1/security]** Slack inbound endpoint mutates jobs with **no org scoping at all** (`updateMany` by bare job id, `apps/api/src/routes/slackEvents.ts:122-164`), using the deprecated, replay-forever `SLACK_VERIFICATION_TOKEN`.
6. **[P1/reliability]** No `trustProxy` on Fastify (`apps/api/src/server.ts:36-53`): every rate limit — including the 10/min SMS budget — is one shared bucket behind Railway's proxy; audit/identity is the proxy IP. Also no SIGTERM handling anywhere (`apps/api/src/index.ts`).
7. **[P1/correctness]** An **unterminated JSX comment** at `apps/hq/src/features/map/MapLibreView.tsx:678` swallows the entire `<Source id="vehicles">` block (onsite halos, van dots, heading arrows, labels) into a comment that compiles clean — the vehicle layer never renders while its data plumbing still runs. (Compounds product-intent drift: store says live tracking is disabled, yet the van trail *does* render.)
8. **[P1/correctness]** Selection split-brain on the FieldLoop map: `MapLibreView.tsx:110` reads `selectedJobId` from the zustand store, but MapSurface selection is URL-backed and never writes the store — the wrong pin reads as selected (stale seed default `j-1001`) and pan-to-selected targets the wrong job.
9. **[P1/connectivity]** Web PWA `lib/notifications.ts:23-61` and `lib/integrations.ts:40-55` bypass the authenticated fetch wrapper → in production every SMS-ETA/Slack notification op and the Integration Health view fail 401 terminally and clog the outbox (`failed_requires_user_action`, cascade-failed dependents). Works only in dev where the legacy header is accepted.
10. **[P1/env]** Root `.env.example` is malformed: `TWILIO_ACCOUNT_SID=""TWILIO_AUTH_TOKEN=""` merged on one line (`.env.example:55`) and `AUTH_SECRET` declared twice with the empty copy winning → verbatim copy fails API boot. The documented global-`DATABASE_URL`-override trap is unguarded in `dev`, `db:seed`, and `db:migrate` (`apps/api/package.json:7`, `packages/database/package.json:23`).

---

## 1. API (`apps/api`)

### Auth / tenant
- **[P0]** Device bootstrap secret in public bundle (see index #3). No per-user identity, no device registry, no revocation; 30-day tokens (`auth.ts:8`).
- **[P1]** Slack cross-tenant writes + deprecated verification token, no replay protection (index #5).
- **[P1]** Quote-line DELETE missing org check (index #4). Test suite covers PATCH only (`test/quotes.test.ts:68-77`).
- **[P2]** `PATCH /api/jobs/:id` accepts `customerId`/`propertyId` without org-ownership validation (create validates, patch doesn't) → cross-tenant linkage (`jobs.ts:167-193` vs `:43-53`).
- **[P2]** Appointments POST/PATCH accept arbitrary `assignedStaffId` — no membership check, no overlap check, no skill check; technicians can self-assign (`residential.ts:153-194`), bypassing every guardrail `PATCH /api/jobs/:id/assignment` enforces.
- **[P2]** Stream tokens persist in access logs via `?token=` query (pino redacts only cookie/authorization headers) (`stream.ts:23-27`, `server.ts:44-47`).
- **[P2]** Both webhook routes sit behind the global 500/min IP limiter — a flood 429s real Stripe/Slack provider calls (`server.ts:79`).
- **[P3]** `POST /api/organizations`: slug collision → Prisma P2002 → 500 instead of 409 (`organizations.ts:28-37`).
- **[P3]** Technicians can read integration delivery payloads (customer detail text) — no `requireRole` (`integrations.ts:8-22`).
- Verified clean: jobs GET/PATCH/DELETE, time-entries, checklist PATCH, photo DELETE, quotes GET/POST/PATCH + line POST/PATCH, documents, RFIs, customers/properties/agreements, notifications, media, board, fleet, sms, sync, job messages; Stripe webhook verification is solid (raw body, freshness window, timing-safe).

### Connectivity / IO / lifecycle
- **[P1]** `geocodeAddress()` (up to 8s) awaited **inside** the interactive Prisma transaction in job PATCH — exceeds the default 5s tx timeout, holds a pool connection, rolls back an applied update (`jobs.ts:197-199`, `routing.ts:33`).
- **[P2]** Stripe/Slack outbound fetches have no timeout/abort (`lib/payments.ts:62-69`, `lib/slack.ts:80-84`); a Slack hang past the 60s worker lease enables double-posting across replicas.
- **[P2]** No graceful shutdown: zero SIGTERM/SIGINT handlers; `app.close()` never called; in-flight requests killed, sockets never unsubscribed (`index.ts:12-34`).
- **[P3]** Prisma client has no pool/timeout config (`packages/database/src/index.ts:5`); sync first-pull payload unbounded (`routes/sync.ts:100-107`).

### Validation / correctness
- **[P1]** `POST /api/jobs` reads `quotedLines` off the raw body, bypassing zod — unbounded count/length into `createMany` (`jobs.ts:68`, `schemas/job.ts:5-16`).
- **[P2]** Sync cursor `"1e300"` → `new Date(Infinity)` → Prisma 500 (`sync.ts:96-98`).
- **[P2]** Assignment block math builds slots from **UTC** date parts with 08:00–18:00 UTC clock times — wrong local day for a UTC+10 org; overlap validation runs against wrong windows (`jobs.ts:129-142`).
- **[P2]** Assignment conflict check is TOCTOU — findFirst + updateMany not in a transaction, no DB constraint (`jobs.ts:144-156`).
- **[P2]** `paymentStatus` is a free-text string column with four spellings across code; `jobStatusSchema` hand-duplicates the Prisma enum (`schema.prisma:342`, `schemas/job.ts:3`).
- **[P3]** `updateTimeEntrySchema.end` is `.nullable()` but not `.optional()`; no `end > start` check (`schemas/job.ts:45`). `integrations.ts:16` casts `status as never`. No max lengths on free-text creates.

### Error handling / observability
- **[P1]** Unconfigured Stripe → `createCheckoutSession` **throws** → 500; the route's intended 503 branch is unreachable dead code (`jobs.ts:469`, `lib/payments.ts:42-44`).
- **[P3]** Silent `.catch(() => {})` in audit + workers — audit loss invisible (`lib/audit.ts:30-33`, `integrationWorker.ts:200`, `domainEventWorker.ts:119`, `liveBus.ts:74`). Three coexisting error-body shapes. WebSocket has no `error` listener — can take down the process (`stream.ts:36-53`).

### Routing / design / performance / tests
- **[P1]** `GET /api/routes/today` **writes two rows per board/map load, forever** (RouteVersion + audit row, version=last+1) — GET is not safe; route payload is a stub (`routes.ts:34-42`).
- **[P2]** `GET /api/jobs` and `GET /api/board` unbounded (no `take`; jobs includes all timeEntries+photos) (`jobs.ts:26-34`, `board.ts:27-44`). Synchronous geocode/reverse-geocode in mutation hot paths (job create, time-entry create) add up to 8s to field writes.
- **[P3]** `PUT .../agreements/:id` is really PATCH semantics; routing proxy method contract inconsistent (`/snap`/`/optimize` POST, rest GET-query; `/snap` validates body with the query schema); no appointment DELETE (cancelled appointments block the board's `take: 1`); `sendMissingOrg` returns 400 in dev vs 401 in prod.
- **[P2]** No route tests for Stripe webhook signature verification, organizations, routes/today, or the stream route; no cross-tenant test for the quote-line DELETE hole.

## 2. HQ frontend (`apps/hq`)

### Rendering / correctness
- **[P1]** Unterminated JSX comment kills the vehicle-marker layer (index #7).
- **[P1]** Selection split-brain (index #8).
- **[P1]** Right-click status overrides and slash-command statuses mutate the store only (no persist) — silently revert within 5s via `hydrateFromApi`, and the Slack card spawned with them evaporates too (`JobBlock.tsx:52-60`, `SlackCommsPanel.tsx:182`, `boardStore.ts:249-260`).
- **[P1]** `performClockOff` failure path: no rollback, no enqueue, toast claims "Saved locally; sync will retry" — nothing retries, next poll reverts the clock-off (`board/actions.ts:233-243` vs clock-on at `:199-206`).
- **[P2]** Live hydration invents assignments: round-robin techs for unassigned jobs + `(index*5)%20` pseudo-slots collide → "unassigned" surfaces permanently empty, conflict rings fire on load for overlaps `canAssign` itself forbids (`lib/adapter.ts:143-155`, `:105-109`).
- **[P2]** Adapter drops `priority` (always `"normal"`) — emergency channel (red siren, priority filter, map red) can never trigger on live data (`adapter.ts:191`).
- **[P2]** Empty-but-successful board poll strands the console in "Connecting" forever (`useBoardLifecycle.ts:42-47` requires `jobs.length > 0`).
- **[P2]** Inspector "Call" link dials the client's *name*: `tel:` + company name (`Inspector.tsx:96`).
- **[P2]** Hardcoded fixture bypass in Dispatch table: `job.title === "Boiler Annual Service"` always shows regardless of filters (`DispatchViews.tsx:14`). "Route gaps" health button emits an event nobody handles (`DispatchHealthStrip.tsx:33`).
- **[P2]** Quote mutations (`performMarkSent`/`performMarkApproved` + four store actions) have zero callers — dead code that would also be poll-reverted if wired (`board/actions.ts:250-280`, `boardStore.ts:492-544`).

### Redundancy / duplication
- **[P2]** Dead files/branches: `DashboardModule`, `OperationsCoverageCard`, `PlaceholderModule` + unreachable branch, "calendar" branch, `features/fieldloop/context.tsx` (93 lines, no consumers).
- **[P2]** Two command palettes (cmdk `CommandPalette.tsx` vs hand-rolled `fieldloop/Palette.tsx`), both binding ⌘K, with different keyboard/a11y behavior; two selection systems (store vs URL).
- **[P2]** Two `personColor` algorithms (id-sorted sticky slots, cap 4 vs roster-index cycling 8) — same tech can be a different color on the canvas vs the map (`statusStyles.ts:98-111` vs `palette.ts:119-121`).
- **[P2]** `shiftDay`/`mondayOf` reimplemented 4×; `initials`/`nowFraction` duplicated; `TOTAL_BLOCKS` hardcoded in `AvailabilityPanel.tsx:58`.
- **[P3]** Dead: `toast.tsx` (128 lines, type-only reference), `useToast()` (no callers), `glow-active` keyframes, `vehicles` selector, `techIndex` prop.

### Initialisation
- **[P2]** Theme loop is one-way dead wiring: `setTheme` writes localStorage, nothing reads it; no toggle exists; the `.dark` block is unreachable **and broken** (~40 hardcoded `#fff`/light hexes in `.fl-*` rules → white-on-white if dark ever ships) (`boardStore.ts:213-220`, `globals.css:99-139, 192-401`).
- **[P3]** Telemetry socket starts before the auth gate resolves — retries 401 forever behind the sign-in screen; unmount-during-connect leaks a WebSocket (`AppShell.tsx:106`, `telemetry.ts:113-121`). IndexedDB jobs cache rewritten every 5s. Map ETA frozen at memo time; `reachCache`/`shapeCache`/`snappedTrails` unbounded.

### Accessibility
- **[P2]** Nested interactive elements: tech row `<button>` containing `role="button"` spans (`CrewTree.tsx:94-145`) — invalid HTML, unpredictable AT behavior.
- **[P2]** FieldLoop palette: no focus trap, no listbox semantics/`aria-activedescendant`, no focus restore; Escape only works inside the input (`Palette.tsx:89-137`).
- **[P3]** Presence `.offline` class has no CSS rule → offline renders like available (hollow circle, label-only difference). Color-only identity in calendar headers. `ring-offset-void` references an undefined color. Unlabeled `<select>` in `MapView.tsx:61`. Comms drawer lacks dialog semantics. Duplicate "Previous/Next day" controls when calendar view is open.

### Connectivity
- **[P2]** `persistJobStatus` classifies 401/403/404 as retryable `NetworkError` → permanently-rejected ops retried forever on every `online` event (`lib/api.ts:185-187`, `offline.ts:108-120`).
- **[P3]** SW `message` listener never removed (double-drain under StrictMode) (`offline.ts:133-138`). Van-trail snap refetches on every telemetry ping. `crypto.randomUUID()` throws in non-secure contexts → every request fails to demo fallback on plain-HTTP LAN. `slackBridge` can never post cards for genuinely new jobs (`!prior` continue at `slackBridge.ts:78`).

### Routing / layout / UX
- **[P3]** No `error.tsx`/`not-found.tsx` anywhere — render crash white-screens; `MapErrorBoundary` retry re-renders the same failing chunk without a remount key. `?presentation` read from `window.location` during render while everything else uses nuqs; two nuqs bindings write the same `date` key. MapSurface crew picker is component state while Dispatch's is URL. Slack badge count ≠ its label.
- **[P3]** Undocumented z-index regime; `.fl-window` hardcoded `calc(100% - 20px)`; element-selector styling (`fl-top-right button`) invites specificity fights.

## 3. Technician PWA (`apps/web`)

### Data loss / storage
- **[P0]** Poll merge wipes local-only collections (index #2).
- **[P1]** Full-resolution photos/documents as data URLs inside localStorage-backed state; quota errors swallowed in `catch {}` → **all persistence silently stops** once ~5MB trips; MB-scale `JSON.stringify` on every state change (`usePlumbTrack.tsx:634`, `DocumentComponents.tsx:93-165`, `:95-101`).

### Auth lifecycle / connectivity
- **[P1]** Log Out leaves IndexedDB outbox (signed signature images, site photos), SW data caches, and the legacy auth token on shared devices — dialog promises otherwise (`usePlumbTrack.tsx:769-773`, `outbox.ts:189-220`, `service-worker.js:26-48`).
- **[P1]** 401 mid-shift: session cleared, no re-enroll attempt, queued ops transition to terminal `failed_requires_user_action` and are never auto-retried (`api.ts:71`, `outbox.ts:85-94`).
- **[P2]** Per-keystroke `sync-quote` ops (typing enqueues ~10 PATCHes); backoff can reorder writes so an older keystroke wins server-side (`PlumbTrack.tsx:869-877`, `syncManager.ts:54-97`).
- **[P2]** Photo uploads hardcode `image/jpeg` regardless of real file type; no resize/EXIF (`usePlumbTrack.tsx:642`).
- **[P3]** Four redundant outbox pollers, no `visibilitychange` gating. Boot race: legacy-queue migration lags the outbox protection window.

### Correctness / UX
- **[P1]** Accepted quotes render with a "Draft" badge — status-map keys don't match the domain enum (`draft|sent|accepted`) (`PlumbTrack.tsx:1135-1148`, `types/index.ts:4`).
- **[P2]** "Sync to Xero & Close" and "Uploading proof…" are simulated theatre — `setTimeout`s, no API calls, on billing-critical actions (`usePlumbTrack.tsx:747-759`, `CaptureBar.tsx:69-76`).
- **[P2]** Sign-off double-tap creates duplicate outbox ops (button not disabled during async save) (`SignaturePad.tsx:69-73`).
- **[P2]** "Dismiss" on a single failed op discards **all** failed ops + their media blobs, unconfirmed — destroys photo evidence (`SyncCenterView.tsx:107`, `outbox.ts:167-174`).
- **[P2]** Swipe-to-clock-in fires the billable action on gesture release, no confirmation/undo (`SwipeableCard.tsx:56-74`). ETA ping re-sends on navigation (per-component `sent` state). Capture-bar photo badge counts ops across all jobs.
- **[P2]** Entire app is component state on one route — no deep links, refresh resets position, emulated Android back via `pushState` sentinel (`usePlumbTrack.tsx:134-136, 942-952`).
- **[P3]** Deep-link regex only matches legacy `J-\d+`/`Q-\d+` ids, not server cuids (`MessagesView.tsx:58`).

### Dead code / duplication
- **[P2]** `SET_JOB_STATUS` + 7 more reducer actions never dispatched (the only signature-less status transition path is dead); `JobActionsSheet`, `Skeleton.tsx` unused (`state/actions.ts:21-45`, `reducer.ts:615-739`).
- **[P2]** Three divergent fetch wrappers with different auth semantics (api.ts / notifications.ts / integrations.ts) — root cause of the 401 cluster.
- **[P2]** Status presentation duplicated 3× in-app (StatusChip vs TodayStream inline vs QuoteStatusBadge), already drifted; 3 duration formatters; 2 voice-capture components (~70 lines duplicated); quick-note chips duplicated.

### A11y / init / styling
- **[P2]** Safety-confirmation toggles lack `aria-pressed`/`role="checkbox"`; nested button in `CrewRouteJobTree.tsx:28-30`; signature canvas unlabeled; toast dismiss ~22px target. Sync "failed needs attention" transition is silent (no aria-live).
- **[P2]** Theme applied post-mount → dark flash on cold boot; static dark `theme-color` in light mode (`PlumbTrack.tsx:104-117`, `layout.tsx:50-57`).
- **[P3]** TodayStream bypasses token classes with inline `var(--chrome-*)` styles; hardcoded skeleton header height; unconditional pulsing "GPS check-in" dot.

## 4. Workspace / CI / env (cross-cutting)

### Deploy-correctness
- **[P0]** Prod web API URL cluster (index #1): scheme-less ref + no web-side normalization + root Dockerfile missing `NEXT_PUBLIC_*` ARGs + `dockerfilePath` unpinned for web in IaC (`railway.ts:74-87`).
- **[P1]** `.env.example` malformed (index #10); global `DATABASE_URL` trap unguarded in `dev`/`db:seed`/`db:migrate`.
- **[P2]** Env examples drift: root omits `HQ_BOOTSTRAP_TOKEN`/`HQ_ORG_ID`/`HQ_OPERATOR_ROLE`/`NEXT_PUBLIC_HQ_*`; web's omits `NEXT_PUBLIC_DEVICE_BOOTSTRAP_TOKEN`.
- **[P2]** Prod origins + `PUBLIC_API_BASE_URL` hardcoded in IaC ("update if services are recreated"); no staging environment anywhere (`railway.ts:34,50`).
- **[P2]** Web service has no healthcheck; hq healthcheck probes `/` (SPA shell 200s even with a broken bundle) (`railway.ts:74-96`).

### Redundancy / waste
- **[P1]** `apps/dispatch` (superseded Electron prototype) is still a workspace member: drags the Electron binary into every CI install, builds via `electron-vite` in `pnpm build`, its "test" is a literal `echo`, and README falsely claims it's outside workspace builds. Carries a git-tracked 3,151-line stale lockfile and forked types/seed/format helpers.
- **[P2]** Stale HQ Playwright suite: 36 tests selecting elements that no longer exist; config boots a full build+start; not wired to CI (burns no minutes but `pnpm test:e2e` invites an unpassable run).
- **[P3]** 19 tracked PNGs under `apps/hq/screenshots/`; machine-specific `scripts/bootstrap-db.mjs` (hardcoded psql path, scrapes credentials from a sibling repo).

### Duplication between apps
- **[P1]** Three incompatible `JobStatus`/`QuoteStatus` vocabularies (web matches Prisma; hq doesn't; dispatch is a subset) + hand-rolled 250-500-line type files per app instead of a shared contract package.
- **[P1]** Format/block-time helpers copy-pasted and diverged (`format.ts` en-AU vs en-US; web's `display.ts` documents the exact UTC+10 `toISOString` corruption that hq's `seed.ts:6-10` still commits with a noon hack).
- **[P2]** Status color/label maps triplicated with different labels for the same state; Tailwind token maps duplicated between hq and web with real drift (`fill` → different vars); the status-token hex ramps maintained twice in two `globals.css` files.

### CI / tooling
- **[P2]** No concurrency cancellation (stacked PRs queue serial 20-min gates); e2e job re-checkouts/re-installs/rebuilds what `ci` just built; no Playwright browser cache; no turbo remote cache.
- **[P2]** Web e2e gate can pass on a fraction of the suite: 2 specs permanently grep-excluded (8 tests), 7 wall-clock `test.skip()` branches; docs claim 27 specs, reality is 30 declared / ~22 executable. No minimum-executed-test assertion.
- **[P2]** Turbo `globalEnv` lacks `NEXT_PUBLIC_*` → stale-cache replays when build-time env changes (`turbo.json:4`).
- **[P2]** Two lint baselines (hq/web extend only `next/core-web-vitals`); `@plumbtrack/eslint-config` a declared-but-unused devDep; shared config disables `no-explicit-any`; `noUncheckedIndexedAccess: false`; dispatch has no lint script so turbo silently skips it.
- **[P3]** Actions pinned by tag not SHA; root `turbo: ^2.3.3` vs Dockerfiles pinned `2.3.3` (prune-output drift risk); workflow-level `DATABASE_URL` leaks into the Postgres-less e2e job; `railway` CLI as a root devDep pulled by every CI install; no LICENSE, no formatter/commit hooks (formatting already forked: hq no-semicolon vs web semicolons); eslint 8 (EOL).

---

## Themes and recommended order of attack

1. **Production-path correctness first (P0 cluster):** fix the web API URL normalization + pin the web Dockerfile/IaC; fix `.env.example`; guard `DATABASE_URL` in scripts. Cheap, high blast radius.
2. **Data-loss and auth-lifecycle in the field app:** MERGE_REMOTE local-collection preservation + pending-photo protection; authenticated notification wrapper; 401→re-enroll; logout clears IDB/caches. The field app currently loses work in its core scenario (online!) — that inverts the offline-first promise.
3. **Security siblings:** quote-line DELETE org check (one lookup), Slack team_id→org mapping + signing secret, `trustProxy`, bootstrap-secret redesign (already flagged in AGENTS.md as the next design project — this audit adds the "secret ships in the bundle" concreteness).
4. **HQ truthfulness fixes:** close the unterminated comment (decide the vehicle-layer intent first), unify selection state (prop or URL→store sync), persist status overrides through the BR-07 path, fix the adapter's invented assignments (they mask the product's core action queue).
5. **Consolidation (absorbs ~1,000+ lines):** `packages/shared` (zod contract types, status maps, format helpers) + `packages/ui-tokens` (CSS vars + Tailwind preset); single fetch wrapper in web; one command palette; delete dispatch from the workspace, the stale HQ e2e suite, and dead files.
6. **CI hygiene:** concurrency group, artifact/browser caching, `NEXT_PUBLIC_*` in turbo `globalEnv`, deterministic e2e seeds with a min-test assertion.
