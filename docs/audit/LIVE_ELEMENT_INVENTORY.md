# FieldLoop — live-element inventory

Date: 2026-09-16 · Basis: code walk + browser verification (field agent web, demo
mode + live mode against no API) + API route/role-table extraction. Rows marked
"code" are verified by reading source; rows marked "live" were exercised in a
browser or against the deployed API.

Status legend: **LIVE** — does the real thing end to end · **HONEST-UNWIRED** —
real code path exists, shows an explicit "not connected — needs X" state ·
**FAKE** — simulates success · **BROKEN** — calls a path that cannot work ·
**PLACEHOLDER** — static sample content presented as real.

## Summary counts (before Phase 2–3 fixes)

| Status | API | HQ | Field agent | Total |
|---|---|---|---|---|
| LIVE | 21 | 14 | 17 | 52 |
| HONEST-UNWIRED | 3 | 2 | 4 | 9 |
| FAKE | 1 | 2 | 2 | 5 |
| BROKEN | 1 | 1 | 3 | 5 |
| PLACEHOLDER | 0 | 0 | 2 | 2 |

---

## 1. API surface (`apps/api/src/routes`)

Auth is session-bearer; every route below is additionally org-scoped by the
tenant hook unless noted. "Role" = `requireRole` gate.

| Route | Role gate | Validation | Status | Evidence / notes |
|---|---|---|---|---|
| GET /api/auth/session | any authed | — | LIVE | code |
| GET /api/auth/stream-token | any authed | — | LIVE | code |
| POST /api/auth/device | none (bootstrap token) | manual | LIVE (shared-secret, see Phase 4) | code — public `DEVICE_BOOTSTRAP_TOKEN` mints technician sessions |
| POST /api/auth/hq-session | none (bootstrap token) | manual | LIVE (shared-secret) | code — `HQ_BOOTSTRAP_TOKEN` mints owner sessions |
| POST /api/auth/renew | own session | — | LIVE | code |
| POST /api/auth/sign-out | any authed | — | LIVE | code |
| GET /api/board | any authed | — | LIVE | code + live (HQ live mode) |
| GET /api/board/needs-attention | any authed | — | LIVE | code; `MIN_TRAVEL_BUFFER_MINUTES` defined-but-unused in lib/needsAttention.ts — spec §2 travel-buffer flag likely not implemented (verify in Phase 3) |
| GET /api/documents | FIELD_ROLES | query cast | LIVE | code — any technician reads the org register (Phase 4 decision) |
| POST /api/documents | FIELD_ROLES | manual | LIVE | code — accepts opId |
| PATCH /api/documents/:id | OFFICE_ROLES | manual | LIVE | code |
| POST /api/documents/:id/versions | FIELD_ROLES | manual | LIVE | code |
| DELETE /api/documents/:id | OFFICE_ROLES | — | LIVE | code |
| GET /api/jobs/:jobId/rfis | FIELD_ROLES | — | LIVE | code |
| POST /api/jobs/:jobId/rfis | FIELD_ROLES | manual | LIVE | code |
| PATCH /api/rfis/:id | FIELD_ROLES | manual | LIVE | code |
| POST /api/fleet/telemetry | technician | zod | LIVE | code |
| GET /api/health | open | — | LIVE | live — 200 on prod |
| GET /api/integrations/deliveries | any authed | query cast | LIVE | code — technician can read delivery log (Phase 4 decision) |
| GET /api/integrations/health | any authed | — | LIVE | code |
| POST /api/integrations/deliveries/:id/retry | office | — | LIVE | code |
| GET /api/jobs/:id/messages | any authed | — | LIVE | code — any technician reads any job's thread (Phase 4 row-scope decision) |
| POST /api/jobs/:id/messages | tech+office | zod | LIVE | code — direction guard for technicians; opId idempotent |
| GET /api/messages/threads | any authed | — | LIVE | code — org-wide thread list for any technician (row-scope decision) |
| GET /api/jobs | any authed | query cast | LIVE | code — full org job list for any technician (row-scope decision) |
| POST /api/jobs | office | manual | LIVE | code — auto-creates schedulable appointment |
| GET /api/jobs/:id | any authed | — | LIVE | code |
| PATCH /api/jobs/:id/assignment | office | manual | LIVE | code — advisory-lock conflict check; HQ verified |
| PATCH /api/jobs/:id | field `{status,signature}` else office | manual | LIVE | code — split role gate |
| DELETE /api/jobs/:id | admin/owner | — | LIVE | code |
| POST /api/jobs/:id/time-entries | FIELD_ROLES | manual | LIVE | code |
| PATCH /api/jobs/:id/checklist-items/:itemId | FIELD_ROLES | manual | LIVE | code — org-scoped |
| PATCH /api/jobs/:id/time-entries/:entryId | field `{end}` else manager+ | manual | LIVE | code — resolves by id or opId |
| POST /api/jobs/:id/photos | FIELD_ROLES | manual | LIVE | code |
| DELETE /api/jobs/:id/photos/:photoId | manager+ | — | LIVE | code — parent job org-verified |
| POST /api/jobs/:id/signoff | FIELD_ROLES | manual | LIVE | code — opId idempotent |
| POST /api/jobs/:id/events | FIELD_ROLES | manual | LIVE | code — monotonic arrival/departure |
| **POST /api/jobs/:id/payment-link** | FIELD_ROLES | manual | **BROKEN (authority)** | code — **client sends `amount`; server trusts it.** Any field token can price a job (Phase 9 fix: server computes) |
| POST /api/jobs/:id/notes | FIELD_ROLES | manual (2000-char cap) | LIVE | code — opId idempotent |
| POST /api/media/upload-intents | tech+office | manual | LIVE | code — content-type allowlist |
| POST /api/media/:assetId/complete | tech+office | manual | LIVE | code — `purpose: "document"` path added 09-16 |
| GET /api/media/:assetId/file | any authed | — | LIVE (permanent URL — Phase 9 gap) | code — `Cache-Control: immutable`, no expiry |
| GET /api/notifications/status | any authed | — | LIVE | code |
| GET /api/notifications | NOTIFICATION_AUTHORS | — | LIVE | code |
| POST /api/notifications | NOTIFICATION_AUTHORS | manual | LIVE | code |
| GET /api/organizations | any authed | — | LIVE | code |
| GET /api/organizations/:id | any authed | — | LIVE | code |
| POST /api/organizations | admin/owner | manual | LIVE | code |
| POST /api/webhooks/stripe | signature | — | LIVE | code — rawBody fix verified; signature-verified |
| GET /api/quotes | dispatcher/manager/accountant/admin/owner | — | LIVE | code |
| POST /api/quotes | office+accountant | manual | LIVE | code |
| GET /api/quotes/:id | any authed | — | LIVE | code — technician-readable quote detail (Phase 4 row-scope decision) |
| PATCH /api/quotes/:id | office+accountant | manual | LIVE | code — send/approve |
| DELETE /api/quotes/:id | manager+ | — | LIVE | code |
| POST /api/quotes/:id/lines | office+accountant | manual | LIVE | code |
| PATCH /api/quotes/:id/lines/:lineId | office+accountant | manual | LIVE | code — org-scoped |
| DELETE /api/quotes/:id/lines/:lineId | office+accountant | — | LIVE | code |
| GET /api/customers | operationalRoles (incl. technician) | — | LIVE | code — **any technician lists all org customers (PII — Phase 4 decision)** |
| POST /api/customers | operationalRoles | manual | LIVE | code |
| **GET /api/customers/:id** | **officeRoles (no technician)** | — | **BROKEN for field agent** | code — the mobile customer screen calls this; a technician gets 403 → screen permanently falls back to job-carried data |
| PATCH /api/customers/:id | officeRoles | manual | LIVE | code |
| GET /api/customers/:id/agreements | officeRoles | — | LIVE (office) / unreachable for field | code — field agent can't read agreements either |
| POST /api/customers/:id/agreements | officeRoles | manual | LIVE | code |
| PUT /api/customers/:customerId/agreements/:agreementId | officeRoles | manual | LIVE | code |
| GET /api/customers/:id/properties | operationalRoles | — | LIVE | code |
| POST /api/customers/:id/properties | operationalRoles | manual | LIVE | code |
| PATCH /api/customers/:customerId/properties/:propertyId | officeRoles | manual | LIVE | code |
| GET /api/routes/today | ROUTE_ROLES | — | LIVE | code — write-on-change + real haversine geometry |
| GET /api/routing/shape | office | — | LIVE | code |
| GET /api/routing/matrix | office | — | LIVE | code |
| GET /api/routing/geocode | FIELD_ROLES | — | LIVE | code — live heigit proxy |
| GET /api/routing/reverse | FIELD_ROLES | — | LIVE | code |
| GET /api/routing/isochrones | office | — | LIVE | code — `isochroneCache` declared twice (module scope L169 + inner L378); inner shadows outer — dead module-scope declaration |
| POST /api/routing/snap | office | — | LIVE | code |
| POST /api/routing/optimize | office | — | LIVE | code |
| GET /api/slack/workspace | OFFICE_ROLES | — | LIVE | code — office-gated 09-13 |
| GET /api/slack/oauth/url | manager+ | — | LIVE | code |
| GET /api/slack/oauth/callback | any authed | — | LIVE | code |
| POST /api/slack/workspace | admin/owner | manual | LIVE | code |
| DELETE /api/slack/workspace | admin/owner | — | LIVE | code |
| GET /api/slack/routes | OFFICE_ROLES | — | LIVE | code |
| PUT /api/slack/routes/:eventType | manager+ | manual | LIVE | code |
| DELETE /api/slack/routes/:eventType | manager+ | — | LIVE | code |
| GET /api/slack/channels | OFFICE_ROLES | — | LIVE | code |
| GET /api/slack/channels/:id/messages | OFFICE_ROLES | — | LIVE | code |
| GET /api/slack/events/status | open | — | LIVE | code |
| POST /api/slack/events | signature | — | LIVE | code — HMAC v0 verified |
| **POST /api/sms/eta** | **office only** | zod | **HONEST-UNWIRED (provider) / BROKEN for field** | code — honest `sent:false` when Twilio unconfigured; but technicians are excluded — the field OMW button has no permitted route (Phase 3 decision) |
| GET /api/stream | any authed | — | LIVE | code — live frames |
| GET /api/sync | any authed | — | LIVE | code — ships CRM fields, geocode, arrival/departure, photos |

API gaps to fix (Phases 2–5): payment-link amount authority; customer-read for
field roles (scoped); technician SMS ETA gate; zod on all remaining raw casts
(~24 sites); `GET /api/media/:id/file` expiring URLs; shared rate-limit store.

---

## 2. Field agent (`my-mobile-app`, Expo/RN — web PWA + native)

Every screen walked. Writes go through `lib/outbox.ts` →
`lib/fieldActions.ts` op handlers.

| Screen / element | Action | Backend call | Status | Evidence / notes |
|---|---|---|---|---|
| Clock-in gateway — LOG ON | clock-on + shift actor start | `POST /api/auth/device` then local shift machine | LIVE | code + live (web, demo). Production needs `EXPO_PUBLIC_DEVICE_BOOTSTRAP_TOKEN` baked (Phase 4 replaces with per-operator) |
| Clock-in gateway — "Good morning, **Dave**" | greeting | — | **PLACEHOLDER** | code — `ClockInGateway.tsx:64` hardcodes "Dave" |
| Clock-in gateway — install prompt | share→home-screen guidance / `beforeinstallprompt` | — | LIVE | code — `InstallPrompt.tsx`; iOS card + real install button elsewhere |
| Jobs list — job row | open job | client-side `/job/[id]` | LIVE | live — 4 demo jobs render and open |
| Jobs list — pull-refresh | re-sync | `GET /api/sync` | LIVE | code — sync manager; local API absent shows honest offline state |
| Job detail — customer card | open customer | `/customer/[id]` → `GET /api/customers/:id` | **BROKEN** | code — API route is office-gated; technician always 403s → fallback only |
| Job detail — Call | `tel:` | — | LIVE | code — uses `job.phone` (real number) |
| Job detail — ON MY WAY → SEND | send ETA SMS | **none — `setOmwSent(true)` local flag** | **FAKE** | code — `job/[id].tsx:248`; `POST /api/sms/eta` exists but is office-gated and the app never calls it. Also message text hardcodes "this is Dave" |
| Job detail — checklist rows | toggle item | `PATCH /api/jobs/:id/checklist-items/:itemId` via outbox `checklist-item` | LIVE | code — idempotent opId |
| Job detail — START/STOP JOB CLOCK | time entry | `POST /api/jobs/:id/time-entries` + PATCH end via outbox | LIVE | code — but writes `staffId: "staff-1"` (`fieldActions.ts:75`, `store.ts:383,403`) |
| Job detail — price book rows | add invoice line | none — local `invoiceItems` | **PLACEHOLDER** | code — `PRICE_BOOK` is a hardcoded 8-item AUD list (`priceBook.ts`); items lost on reload (not persisted) |
| Job detail — qty +/− / remove | edit lines | local state | LIVE (local) | code |
| Job detail — **SEND INVOICE** | send invoice | **none — `patchJob({invoiceSent:true})`** | **FAKE** | code — `job/[id].tsx:155`; marks sent locally, nothing leaves the device, lines aren't persisted |
| Job detail — CAPTURE PHOTO → USE PHOTO | photo evidence | upload-intent → PUT → complete via outbox `photo-upload` | **BROKEN (bytes)** | code — `fieldActions.ts:380` PUTs the base64 **string** as the body; the document path correctly sends `base64ToBytes`. Stored "photos" are text files |
| Job detail — photo RETRY / DISCARD | `recoverPhoto` | local op state | LIVE | code |
| Job detail — RECORD ARRIVAL / DEPARTURE | job event | `POST /api/jobs/:id/events` via outbox `job-event` | LIVE | code — monotonic server-side |
| Job detail — sign-off → signature | customer sign-off | `POST /api/jobs/:id/signoff` via outbox `customer-signoff` | LIVE | code — SignaturePad + review sheet; opId |
| Job detail — COMPLETE JOB | complete | `PATCH /api/jobs/:id {status:"completed"}` via outbox `complete-job` | LIVE | code — gated by checklist/sign-off readiness |
| Job detail — site note | note | `POST /api/jobs/:id/notes` via outbox `job-note` | LIVE | code — opId |
| Job detail — job thread link | open thread | `/thread/[id]` | LIVE | code |
| Comms tab — thread rows | open thread | `GET /api/messages/threads` | LIVE | code — honest Slack bridge state strip; live frames update inbox |
| Thread — message send | post | `POST /api/jobs/:id/messages` via outbox `job-message` (opId) | LIVE | code — technician posts `direction:"field"` only |
| Customer — Call / Text / Email | `tel:` / `sms:` / `mailto:` | — | LIVE | code — real record data, disabled honestly when absent |
| Customer — record fetch | load CRM record | `GET /api/customers/:id` | **BROKEN** | code — office-gated; field 403 (same root as above) |
| Customer — history rows | open job | `/job/[id]` | HONEST-DEGRADED | code — disabled when the job isn't synced to device (brief wants single-job fetch instead) |
| Documents — register list | browse | `GET /api/documents` | LIVE | code — technician-readable |
| Documents — capture sheet (camera/library) | capture | upload-intent → PUT bytes → complete → `POST /api/documents` via outbox `document-upload` | LIVE (correct byte path) | code — contrast with photo-upload bug |
| Documents — row → detail sheet → OPEN FILE | open file | `GET /api/media/:id/file` | LIVE | code — opens real URL; unconfigured storage → honest null URL state |
| Map tab — MapLibre map | pan/zoom/pins→job | `maplibre-gl` (web) / native module | LIVE | live — canvas + 4 pins verified 2026-09-16 (web, demo); lazy init + worker served from public/ |
| Map — GO buttons | navigate | `Linking` to nav app | LIVE | code — deep-link to maps app |
| Map — location banner | clock-in fix disclosure | — | LIVE | code — states capture time plainly |
| Profile — theme toggle | switch colourway | local | LIVE | live |
| Profile — **name/avatar "Dave Mitchell · DM · Licensed Plumber"** | identity | — | **PLACEHOLDER** | code — `profile.tsx:57-63` hardcoded; should come from the signed-in operator (Phase 4) |
| Profile — Clock Out → CONFIRM | log-off | local shift machine + telemetry `off_shift` | LIVE | code |
| Profile — START/END BREAK | break | local shift machine + telemetry pause | LIVE | code |
| Profile — SHIFT TRACKING / CLOCK POINTS ONLY | location mode | `fleetTracking` local pref | LIVE | code — persists; policy preserved |
| Profile — connection card → SyncSheet | outbox detail | local | LIVE | code — queued/failed counts honest |
| Profile — PAYABLE SO FAR | award preview | local award engine | LIVE (estimate) | code — MA000036 interpretation; rate `55`/`88` fallbacks in constants until org config ships |
| Tab bar — 4 tabs + badges | navigate | — | LIVE | live |
| Outbox drain — 10 op kinds | replay writes | per-op routes above | LIVE | code — opId idempotency on clock-in/out, complete, signoff, events, notes, messages, documents; checklist item is state-idempotent |
| Live stream — WSS frames | updates | `GET /api/stream` | LIVE | code — reconnect/backoff present; demo-mode simulator only under `forceDemo` |
| Enrollment — device session | auth | `POST /api/auth/device` | LIVE (shared secret) | code — `DEVICE_BOOTSTRAP_TOKEN` baked public → anyone can mint technician sessions (Phase 4 P0) |
| `constants.ts` fallbacks | config | — | **PLACEHOLDER** | code — `org_caulfield_south`, `staff-1`, `van-1`, `localhost:8080`, rate `55`/`88` ship when env unset; prod must fail loud (Phase 2) |
| `demo.ts` / `demoField.ts` | demo data | — | gated | code — used only under `forceDemo`; **must assert tree-shaking/bundle-grep in CI** (Phase 2) |
| `liveStream.ts` demo script | fake frames | — | gated | code — only under `forceDemo` (`Petrov` job etc.) |
| Web reload mid-shift | restore | shift actor | **BROKEN (suspect)** | observed — web reload returns to clock-in gateway; durable actor may not restore on web (verify Phase 6) |

---

## 3. HQ dispatch (`apps/hq`, Next.js)

Surfaces: board (DispatchSurface), map (MapSurface), CRM (CrmSurface),
documents (DocumentsSurface), reports (ReportsSurface), Slack (SlackSurface),
comms (SlackCommsPanel), office hub (OperationsHub), inspector (Inspector),
intake (NewJobForm), palette, sign-in.

| Screen / element | Action | Backend call | Status | Evidence / notes |
|---|---|---|---|---|
| Sign-in — station token | `POST /api/auth/hq-session` | LIVE (shared secret) | code — `HQ_BOOTSTRAP_TOKEN` acts as owner; Phase 4 per-operator |
| Workspace — surface switcher (left rail) | `setSurface` | — | LIVE | code |
| Workspace — sync pane toggle | sync status sheet | — | LIVE | code |
| Workspace — comms button | open SlackCommsPanel | — | LIVE (panel fake — below) | code |
| Workspace — reconnect live | `reconnectLive` | `GET /api/stream` | LIVE | code |
| Workspace — search/palette | `setPaletteOpen` | — | LIVE | code — fuzzy over real jobs |
| Board — drag-to-assign | assign | `PATCH /api/jobs/:id/assignment` | LIVE | code — `performAssignment` live + offline queue + advisory-lock; verified earlier |
| Board — AssignControl (keyboard) | assign | same | LIVE | code — keyboard alternative present (a11y) |
| Board — "+ New job" intake | create | `POST /api/jobs` | LIVE | code — live-mode only; honest "not connected" otherwise |
| Board — status changes | set status | `PATCH /api/jobs/:id` | LIVE | code |
| Board — quote send/approve | quote | `PATCH /api/quotes/:id` | LIVE | code — real PATCH + snapshot rollback; dishonest toast removed 09-13 |
| Board — day prev/next, zoom | navigate | local | LIVE | code |
| Job card / row — select | inspector | local | LIVE | code |
| **Inspector — Call link** | `tel:` | — | **BROKEN** | code — `tel:${job.client}` dials the customer **name** (`Inspector.tsx:99`); no phone field used |
| Inspector — NOTIFY CUSTOMER — ON MY WAY | SMS ETA | `POST /api/sms/eta` | HONEST-UNWIRED | code — real call, surfaces sent/test-mode/failed; needs Twilio creds (owner action) |
| Inspector — job message thread | read/post | `GET/POST /api/jobs/:id/messages` | LIVE | code — "via Slack" provenance + 15 s refresh |
| Inspector — field evidence View | open photo | `GET /api/media/:id/file` | LIVE | code — null-URL honest when storage unconfigured |
| Inspector — failed-op retry/discard | outbox | — | LIVE | code |
| Map — crew sheet, reach rings, pins | view/select | `/api/routing/isochrones` etc. | LIVE | code — real MapLibre (basemap ladder → honest MAP UNAVAILABLE) |
| CRM — customer select | detail | `GET /api/customers*` | LIVE | code — real customers |
| **CRM — job history match** | related jobs | local filter | **BROKEN (logic)** | code — `jobs.filter(job.client === customer.name)` — name matching, not `customerId` (`CrmSurface.tsx:57`) |
| Documents — category filter / select / download | browse | `GET /api/documents`, media file | LIVE | code — real vault; `fileUrl` honest-null when unconfigured |
| Reports — **Create payment link** | Stripe | `POST /api/jobs/:id/payment-link` | **BROKEN (authority)** | code — sends client-computed `amount` (`ReportsSurface.tsx:38`); server trusts body |
| Reports — payment link open | `href={link.url}` | — | LIVE | code — real Stripe URL when configured |
| Slack — connect (OAuth) | `GET /api/slack/oauth/url` | LIVE | code — real OAuth flow |
| Slack — disconnect | `DELETE /api/slack/workspace` | LIVE | code |
| Slack — channel select / messages | `GET /api/slack/channels*` | LIVE | code — office-gated proxy |
| Slack — routing rules edit | `PUT/DELETE /api/slack/routes/:eventType` | LIVE | code — editable routing incl. `job.message_posted` |
| **Comms panel — Slack cards/feed** | simulated Slack | none | **FAKE** | code — `slackBridge.ts` writes `postSlackCard`/`rewriteSlackCard`/`spinUpJobChannel` into a local zustand `slackFeed`; nothing reaches Slack. Presents fake channel cards, Accept buttons, auto "claimed/en-route/on-site/complete" rewrites |
| Comms panel — slash commands | board mutations | local store | PARTIAL | code — mutates local board, not Slack |
| Office hub — metric cards | read | `GET /api/customers|quotes|documents|integrations/health` | LIVE | code — real read-through, 30 s |
| Calendar — prev/next day, select | navigate | local | LIVE | code |
| **HQ org id** | tenant header | — | PLACEHOLDER-ish | code — `NEXT_PUBLIC_HQ_DEV_ORG_ID ?? "seed-org"`; misnamed but load-bearing — replace with session org (Phase 2) |
| Seed data in prod bundle | — | — | CLEAN | code — `DEMO_SEED = NODE_ENV!=="production"`; prod never seeds |
| `HQ_FORCE_DEMO` guard | misconfig alarm | — | LIVE | code — loud console.error when baked into prod |

---

## 4. Confirmed fix list (feeding Phases 2–3)

**Field agent**
1. `ClockInGateway` "Dave" greeting; `profile.tsx` Dave Mitchell/DM/Licensed
   Plumber; OMW "this is Dave" — operator identity (Phase 4 dependency).
2. `staff-1`/`van-1`/`org_caulfield_south`/`localhost`/`55`/`88` fallbacks —
   fail-loud prod config (Phase 2).
3. `PRICE_BOOK` hardcoded catalogue → API price book (Phase 3 + HQ editor).
4. OMW SEND → `POST /api/sms/eta` via outbox + technician gate decision (Phase 3).
5. SEND INVOICE → real Invoice entity + persist + Stripe link (Phase 3).
6. `photo-upload` PUTs base64 text → `base64ToBytes` (Phase 3).
7. `GET /api/customers/:id` office-gate → technician-scoped read (Phase 3/4).
8. Web reload mid-shift restore (verify + fix, Phase 6).

**HQ**
9. `tel:${job.client}` → real phone field (Phase 2).
10. `slackBridge`/`SlackCommsPanel` → real threads/delivery state or remove (Phase 3).
11. `CrmSurface` name-match → `customerId` (Phase 3).
12. `NEXT_PUBLIC_HQ_DEV_ORG_ID` → session org (Phase 4).
13. `job.status_urgent` route — **verified dead**: listed in `slack.ts` EVENT_TYPES (routable in HQ) but nothing emits it — no urgency field exists on Job. Implement field + emitter or mark the route honestly unavailable.

**API**
14. `hqAppBase()` hardcoded Railway fallback → require `HQ_APP_URL` (Phase 2).
15. `MIN_TRAVEL_BUFFER_MINUTES` unused → spec §2 travel-buffer flag (verify).
16. `isochroneCache` double declaration → clean (Phase 2).
17. Payment-link amount → server-computed (Phase 9).
18. `GET /api/media/:id/file` immutable URL → signed expiring reads (Phase 9).
19. zod on all raw casts (~24 sites) (Phase 5).
20. Role matrix + row-scope decisions: customers/documents/threads/quotes/integrations reads (Phase 4).
21. Technician SMS ETA gate — owner decision (Phase 3).
22. Sync tombstones — deletions don't propagate (Phase 6).

**Owner decisions needed (do not guess):** technician SMS ETA; customer-portal;
agreement→job scheduler; Xero/MYOB; technician job row-scope (all vs assigned);
PDF upload; eForm lodgement approach; access-code visibility; per-operator
sign-in method (magic link vs passkey/OTP).
