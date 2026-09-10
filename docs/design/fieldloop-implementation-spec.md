> **STATUS IN THIS REPO (2026-09-11):** this spec is canonical for design
> intent and is now versioned here so it can never again live outside the
> codebase. One dated amendment: **§8's point-in-time-only location policy
> was superseded by an owner decision on 2026-09-11** — the product ships
> TWO technician-selectable tracking modes (SHIFT TRACKING: position shared
> while clocked on, paused on breaks, stopped at log-off; CLOCK POINTS ONLY:
> one capture at clock-in and one at clock-out). Everything else in §8
> (honest non-wired buttons, status-color reservation, honest route labels,
> the Slack preview banner) remains binding. The continuous-tracking
> correction described in §8's precedent applies only to background
> tracking OUTSIDE a shift, which remains prohibited.

# FieldLoop — Design Implementation Spec

This document maps three finished HTML/CSS/JS design references onto the real FieldLoop product so a developer (or build agent) can swap this design in for what currently exists. **These reference files are frontend design artifacts only** — plain HTML/CSS/vanilla JS, not the real stack. They exist to lock visual design, interaction behavior, and information architecture. None of their client-side logic (invoice math, route ordering, offline queuing, etc.) should be copied as-is into production — it should be reimplemented against real data and real backend services, using the reference files as the exact behavioral and visual spec.

**Reference files:**
| Surface | File | Represents |
|---|---|---|
| Field technician mobile app | `fieldloop_mockup.html` | The Expo/React Native app |
| Office/dispatcher web app | `fieldloop_dispatch.html` | The React web dashboard |
| Customer self-service portal | `fieldloop_customer_portal.html` | A new, third surface — not yet built in the real product |

**Target stacks (confirmed):**
- Mobile: Expo / React Native (New Architecture), HeroUI Native built on Uniwind, XState v5 for state, Reanimated v3 for animation.
- Dispatch web app: React + shadcn/ui (Electron wrapper optional).
- Customer portal: not yet decided — treat as a separate, standalone web app with its own auth. Do not bolt it onto the dispatch app's codebase; it has a different audience and a different auth model (customer magic-link, not staff login).

---

## 1. Shared design system

All three surfaces intentionally share one brand identity, expressed differently per surface. Preserve this — it's deliberate, not an oversight to "fix" toward consistency.

### 1.1 Typography (same three fonts, all three surfaces)
- **Big Shoulders Display** (weights 600–800) — headers, hero numerals, large stat numbers only. **Never use below ~24px and never for body text or anything read as a phrase** — condensed type measurably slows glance-reading; this is a load-bearing rule, not a style preference.
- **IBM Plex Sans** (400/500/600) — all body text, labels, UI chrome.
- **IBM Plex Mono** (400/500/600) — all data that updates or must align: timestamps, job IDs, currency figures, dates, invoice numbers. Use tabular/monospace figures anywhere numbers change or stack in a column, so digits don't jitter.
- Scale to carry forward: 12 / 14 / 16 / 20–22 / 28 / 40px+. Body never below 16px on mobile, 13–14px acceptable in dense desktop tables. Never below 12px anywhere.
- Dark mode (mobile only): don't reflexively bold everything up a weight — the readability research this was checked against found no benefit at default weight. What actually matters: no sub-Regular (thin/light) weights on text, and text isn't pure white on pure black (use ~87% white on a ~#121212 surface, not #FFFFFF on #000000), because thin strokes are what bloom on OLED, not weight itself.

### 1.2 Color
Each surface has its own palette, but the **status-color rule is identical everywhere it applies**: red / amber / green (AS 1319-derived) is reserved **exclusively** for job/work/compliance status meaning — never reused for anything else (connection state, presence, navigation). Every status is shown as **icon + color + label together**, never color alone.

- **Mobile** (dark, "premium industrial"): base `#0A0E13`, panels `#131A21`/`#1A232C`, blue-chrome `#3E76AA` (structural/mandatory-action), blue-glow `#4F90FF` (live/active/primary CTA), red `#D7263D`, amber `#F2B705`, green `#1FAA59`.
- **Dispatch** (light, "structural/blueprint"): canvas `#EEF1F2`, panels `#FFFFFF`, blue `#2E5F8A` / blue-bright `#2F6FED`, red `#C81E2C`, amber `#A2660A`, green `#158C48` — deepened versions of the mobile hues for AA contrast on white, status chips use a pale tint background + the deep color for text/icon.
- **Customer portal** (light, warmer/simpler): canvas `#EEF0F0`, panels `#FFFFFF`, same blue-bright `#2F6FED` as the anchor to the other two surfaces (deliberate — same company, same brand, different room). Status vocabulary is **not** AS 1319 trade language — customers don't need "urgent/scheduled" trade jargon. Use a plain progress track (Booked → On the way → In progress → Complete) and reserve color for simpler meanings: green = complete/paid, amber = needs your attention (due, unpaid), blue = in progress / primary action.

### 1.3 Layout patterns to preserve
- **Single-active-inspector pattern** (dispatch): one right-hand panel that routes between states (Needs Attention / Job Detail / Connection / Customer Snapshot / Document Detail / Agreements Due Soon) rather than stacking panels. Each tab that has meaningful proactive content gets a **default "here's what needs you" pane**, not a blank/generic placeholder — this was retrofitted onto CRM (Agreements Due Soon) and Documents (Expiring & Expired) specifically because a "select something" empty state is a missed opportunity everywhere else in the app avoids.
- **Pinned rail + inspector** (dispatch): the left icon rail and right inspector use `position: sticky`, not just DOM order, so they cannot scroll out of view on a narrow viewport. This fixed a real bug during design (rail was scrolling off-screen) — preserve the sticky behavior, don't regress to relying on scroll position.
- **Honest non-wired affordances**: several buttons across all three surfaces are fully styled, respond to taps/clicks, and give real visual feedback, but are **not connected to anything real** — see §5. This is intentional design (a dead-looking button is worse than an honest one that says what it is), not incomplete work to silently "finish" by making up a backend behavior.

### 1.4 Icons
Custom stroke-based SVG line icons (no icon library dependency, no emoji). Keep a consistent visual language (≈1.75px stroke, rounded caps/joins) if redrawing in the real icon system (e.g., swapping to `lucide-react` for the RN/web apps is fine — match stroke weight and keep icon+color+label together for status).

---

## 2. Shared data model

These entities are used across two or more surfaces and should be modeled once, not duplicated per surface.

**Job**
`id, status (urgent|scheduled|complete|unassigned), date, start_time, duration_minutes, title, address, lat, lng, customer_id, technician_id (nullable), notes, checklist[] (label, checked), revenue, cost, invoice_id (nullable), quote_id (nullable)`

**Technician**
`id, name, role, presence (on_job|available|on_leave|offline), van, last_known_location {lat, lng, captured_at} — captured ONLY at clock-in/clock-out, never continuously. This is a locked product and privacy decision, not a v1 shortcut — see §1 mobile location copy and §5.`

**Customer**
`id, name, phone, address, email`. Currently derived by joining on job records in the reference design; should become a first-class table in production, especially once repeat business and the CRM/agreements/portal features depend on it.

**Document**
`id, category (Compliance & Licenses|Vehicles|Job Records), name, entity_type (technician|vehicle|company), entity_id, doc_type, issued_date, expiry_date (nullable), linked_job_id (nullable), file_url (nullable — currently never populated)`

**Service Agreement**
`id, customer_id, service_type, frequency, last_service_date, next_due_date`

**Price Book Item**
`id, name, unit_price`. Shared by mobile's on-site invoice/quote builder; extend this to dispatch/CRM if office-generated quotes are wanted later.

**Invoice**
`id, job_id, line_items[] {price_book_item_id, qty}, subtotal, gst (10%), total, status (draft|sent|paid), sent_at, paid_at`

**Quote**
`id, job_id, customer_id, title, description, price, status (pending|approved|declined), resolved_at`

**SlackWorkspace / SlackChannelRoute**
`SlackWorkspace {org_id, team_id, access_token, connected_at}` and `SlackChannelRoute {event_type, channel_id}` — see §4.6. There is no internal `Message` entity in this product; the equivalent concept is real Slack messages accessed via Slack's own API, not a FieldLoop-native messaging table.

**Needs-Attention Flag** (computed, not stored)
Derived from job data: a job still open past its scheduled end time; two consecutive jobs for the same technician with insufficient travel buffer between different addresses; an unassigned job. This logic should live server-side (or a shared selector layer) so mobile, dispatch, and any future surface see **identical** flags — don't let each client compute its own version and drift.

---

## 3. Mobile app (`fieldloop_mockup.html`)

### 3.0 Shell
Bottom nav, 3 tabs: **Jobs / Map / Profile**. Header persists across tabs: wordmark, connection badge (Live/Offline/Reconnecting), and a location-disclosure line that always states plainly when location was last captured and that it isn't tracked continuously.

### 3.1 Clock In (entry screen)
Full-bleed brand screen, shown before the app shell. Greeting, date, a location-disclosure block **directly above** the Clock In button (not buried in settings — this is the moment consent matters most), and a Clock In button that captures a real timestamp and transitions into the app shell. **Data needed:** technician name/company for greeting; real device geolocation API call, single point, only on this action and on Clock Out.

### 3.2 Today's Jobs (list)
Big job-count numeral, list of job cards (status chip, time, title, address). Tap → Job Detail. **Data needed:** today's jobs for the logged-in technician only.

### 3.3 Job Detail
- Status chip, title, address, time, customer name + tel: link.
- **On My Way**: tap → preview of a real, data-filled message (customer name, phone, computed arrival time) → Send. **Not wired** — needs a real SMS/notification service (e.g., Twilio) behind Send.
- **Agreement awareness card** (conditional): if this job's customer has a service agreement, show whether *this visit* fulfills it or whether it's a different job with the agreement due separately — this distinction must be computed from real data (job type vs. agreement type match), never guessed or always-shown.
- Checklist: tap items to check/uncheck.
- **Auto-generated job note**: built live from whichever checklist items are checked, joined into a plain-language note. This is real, reusable client logic — port the join logic directly, just feed it from real checklist state.
- **Invoice section**: expandable price-book picker (tap to add line items), qty steppers, running subtotal/GST(10%)/total computed live, Send Invoice button. The **math is real and portable as-is**; Send Invoice is **not wired** — needs a real invoicing/payment backend (see §5).
- Capture Photo: **not wired** — needs camera/file picker + upload integration.
- **Complete Job**: branches on connection state. If online, completes immediately. If offline, the job goes into a visibly "Queued — sends when back online" state and increments an outbox counter surfaced on the Profile tab. This queuing behavior must be real in production, backed by the same idempotent-write pattern (`opId`) already used for time-entries in the API, so a retried queued completion can never double-write.

### 3.4 Map
Real MapLibre GL JS, this technician's own jobs only (not the whole crew), status-colored pins, tap → "View job" into Job Detail. Location banner states plainly whether a location was captured at clock-in and when. **For production:** the reference file uses free OpenFreeMap tiles with a CSS filter to fake dark mode — replace with a real dark map style (self-hosted tiles per the existing infra gap ledger) rather than the CSS-invert trick, which was a prototyping shortcut, not a production technique.

### 3.5 Profile / Connection
Clock status + Clock Out, today's stats (complete/remaining/total, computed from job data), connection status, and outbox count ("N items waiting to send"). No manual "sync" action anywhere — by design, since the real architecture is a live WebSocket feed plus an auto-retrying outbox, not something a user triggers.

---

## 4. Dispatch web app (`fieldloop_dispatch.html`)

### 4.0 Shell
Top bar (wordmark, ⌘K search/command palette, date, Copy Link, connection chip, failed-ops chip) + icon rail (6 tabs) + a nav panel that swaps content per tab + a canvas + a single-pane inspector that swaps content per tab. URL query params (`mode`, `zoom`, `tech`, `job`) reflect current view state via `history.replaceState` — carry this forward so views stay shareable/bookmarkable in production. Command palette is a real fuzzy filter over jobs + technicians with keyboard nav — reusable as-is, just point it at real data.

### 4.1 Dispatch (scheduling board)
- **North-star summary**: "N need attention · N jobs today · N complete," color-coded by worst flag severity — computed, not hardcoded.
- **Day / Week / Month**, all three real:
  - Day: hour-timeline per technician row, job blocks positioned by time, live now-line, drag-and-drop reassignment.
  - Week: 7-day × technician density grid, compact chips.
  - Month: real calendar grid; days with no data are honestly empty, not padded.
- **Drag-and-drop**: optimistic move on drop, pending visual state, then resolves — success, or rollback + a recorded failed-op if dropped on an unavailable technician. **Production requirement:** this must be server-authoritative. The reference only validates client-side (technician presence) as a fast pre-check; the real move has to be confirmed (or rejected) by the server, with the same optimistic-then-confirm/rollback UI pattern, not a client-side-only decision.
- **Crew tree** (left nav): presence indicator (on-job / available / on-leave — three visually distinct states, not two), van assignment, per-tech mini job list, typeahead filter, click to highlight/dim the board.
- **Needs Attention** (inspector default): clickable flags computed from real job data (see §2's Needs-Attention Flag definition).
- **Connection/Sync pane**: failed-operation card with Retry/Discard. Retry against a genuine business-rule rejection (e.g., "technician off duty") should fail again, honestly — don't make Retry silently succeed just because the user tried again; that misrepresents what went wrong.

### 4.2 Map
Real MapLibre, job pins + technician "last known" pins (never shown for on-leave/offline technicians — no stale/misleading pin). **Route optimization**: clicking a technician draws their suggested visit order as a nearest-neighbor path over straight-line distance between known coordinates, with an explicit "straight-line distance, not road routing" label. This is genuinely computable client-side with no backend — **port the algorithm as-is**. For real turn-by-turn routing/ETAs, a routing engine (self-hosted OSRM, Mapbox Directions, Google Routes) is a separate, larger integration — don't conflate the two or silently upgrade the label's honesty claim without the underlying capability.

### 4.3 Documents
Category-grouped list (Compliance & Licenses / Vehicles / Job Records), status chip computed from expiry date vs. today (Expired / Expiring soon ≤30 days / Valid / On record — no expiry). **Expiring & Expired** inspector pane by default. "View document" button is **not wired** — needs real file storage (e.g., S3-compatible bucket) behind it.

### 4.4 CRM
Customer list (derived from job records, agreement-badge dot if applicable) → customer detail (contact card, **Service Agreement card** if one exists, full job history table) → **Agreements Due Soon** inspector pane by default, same expiry-math pattern as Documents. This tab was retrofitted with a proactive default pane specifically because it was the one tab lacking one — preserve that pattern when extending the app further; every tab with meaningful proactive content should default to showing it, not a "select something" placeholder.

### 4.5 Reports
Real revenue/cost/margin math over job data — a per-technician margin breakdown (left nav) and a full job table with a week summary (Revenue / Cost / Margin / Margin %) in the canvas. Not-yet-happened jobs are marked "est." rather than presented as settled fact. **Data needed:** `revenue` and `cost` per job — cost is the business's actual labour+materials outlay, not the billed rate, so margin math is meaningful.

### 4.6 Slack integration
**This connects to the real external Slack product via OAuth — it is not an in-app chat feature.** An earlier design pass built a custom job-scoped messaging clone here; that was a misread of the requirement and has been fully removed from the reference file. What's there now is a connection surface, correctly shaped for what "integration" actually means.

**Existing backend capability (confirmed, not hypothetical):** the transactional outbox already routes domain events through an `IntegrationRouter` with a working Slack adapter — `job.completed` and similar events already post to Slack today. This feature extends that into something visible and two-way inside FieldLoop; it isn't starting from zero.

**Two states, and the reference file must not blur them:**
1. **Disconnected (default).** Plain explanation of what connecting does, a "Connect to Slack" button, and copy stating outright that nothing is connected yet. No fake "Connected ✓" indicator anywhere in this state — building one would misrepresent a capability that doesn't exist, the same reasoning that ruled out a fake Xero toggle (§8).
2. **Connected — currently a labeled preview, not live data.** The reference file's "connected" state shows three example channels (`#dispatch-alerts`, `#urgent-jobs`, `#general`) with messages built from this app's own real job data (e.g., an actual completed job's title/address in a bot-style message) rather than lorem ipsum — but every screen in this state carries a persistent, non-dismissable banner: *"PREVIEW — example data. Connect a real workspace to replace this with your actual Slack channels and messages."* **This banner must stay in the design until real Slack data is actually flowing** — do not remove it, water it down, or make it a one-time toast. It is the thing keeping this feature honest, exactly like the "straight-line distance, not road routing" label on the map (§7).

**Layout:** left nav = channel list (once connected) with a "Disconnect workspace" action; canvas = selected channel's message thread (bot-sourced messages visually distinct from human messages) with a compose box; inspector default pane = **Automation Routing**, a read-only table showing which backend event posts to which channel (`job.completed → #dispatch-alerts`, `job.status → urgent → #urgent-jobs`) — this table reflects the real, already-existing `IntegrationRouter` mapping, not a preview.

**What real implementation actually requires (this is the gap — build these, don't extend the mock):**
- A Slack App with OAuth scopes covering at minimum reading channel lists, reading channel history, and posting messages, plus a real OAuth callback flow. The access token belongs in the backend, never sent to or stored in the client.
- `conversations.list` to populate the real channel list (replacing the hardcoded `slackChannels` array in the reference).
- `conversations.history` to populate real thread content (replacing the hardcoded `slackMessages` object).
- `chat.postMessage` to make the compose box actually send (replacing the local-array-push in the reference's `sendSlackMessage`).
- Real-time updates for messages posted directly in Slack to appear back in FieldLoop — Slack's Events API or Socket Mode, not polling.
- A real `SlackWorkspace` record (org id, Slack team id, access token, connected_at) and a real, editable `event_type → channel_id` mapping table backing the Automation Routing pane — the reference's `slackRouting` array is illustrative of the shape, not the real config store.
- **Data model addition:** `SlackWorkspace {org_id, team_id, access_token, connected_at}`, `SlackChannelRoute {event_type, channel_id}`.

---

## 5. Customer portal (`fieldloop_customer_portal.html`)

A new surface, not a re-skin of dispatch or mobile — different audience (a homeowner, not staff), different auth (magic-link, no password), different device assumption (their own phone, checked casually).

### 5.1 Access screen
Email/mobile input → "Send me a secure link" → (mock) sent confirmation → continue. **Not wired** — needs real magic-link auth (short-lived signed token via email/SMS), not a password.

### 5.2 Portal dashboard (single scroll page)
- **Service reminder card** (conditional): shown when the customer has an agreement due soon; "Book now" is **not wired** — needs a real booking-request flow that reaches the office (likely landing in dispatch's Unassigned lane or a booking-request queue).
- **Job status card**: plain-language 4-step progress track (Booked/On the way/In progress/Complete) — **must reflect the job's real current status**, not always show all steps as done the way the reference mock does; the visual pattern is right, the reference's fixed "all done" state is not.
- **Quote approval card** (conditional): shown when a quote is pending for this customer; Approve/Decline are real interaction patterns (resolve to a distinct state each time) but **not wired** — approval/decline needs to notify the office (surface in dispatch, e.g., as a new flag type or CRM notification) and a real price/description coming from an actual quote record, not hardcoded copy.
- **Invoice card**: real running total math (subtotal, GST, total) — portable as-is once fed real line items. Pay button **not wired** — needs a real payment gateway (Stripe is the natural fit given the rest of the stack).
- **Service history**: list of past jobs for this customer.

### 5.3 What's genuinely new here (no existing equivalent to swap in for)
Because this surface doesn't exist in the current product, there's no "swap in for what's there" — this is new build, not replacement. Treat §5.1–5.2 as the full scope of a first version; don't scope-creep it to match dispatch's depth (multi-tab, reporting, etc.) — a customer doesn't need that, by design.

---

## 6. Explicit list: what must be built for real (not carried over as mock)

| Feature | Where | What's needed |
|---|---|---|
| Payment processing | Mobile (Send Invoice), Customer portal (Pay) | Stripe or equivalent, plus webhook handling back into invoice status |
| SMS/notification dispatch | Mobile (On My Way), Portal (magic-link, booking confirms) | Twilio or equivalent |
| Real Slack OAuth + API calls | Dispatch Slack integration | Slack App with OAuth, `conversations.list`, `conversations.history`, `chat.postMessage`, and Events API/Socket Mode for live updates — see §4.6 for the full breakdown. The reference file's "connected" state is an explicitly labeled preview using fabricated example data; none of it should be treated as real |
| Real-time customer notifications | Portal job status | Push from the existing WebSocket/domain-event pipeline into customer-facing channel |
| Accounting sync (Xero/MYOB) | Not designed at all in any surface | Deliberately out of scope this round — needs its own design pass once the integration exists; do not fake a "Connected" state anywhere |
| Production map tiles | Mobile Map, Dispatch Map | Self-hosted tiles + routing with proper quotas/attribution — free OpenFreeMap is fine for dev, not for production, per the existing infra gap ledger |
| Real routing engine | Dispatch route optimization | OSRM / Mapbox Directions / Google Routes for actual road-network paths and ETAs — current design only does straight-line ordering |
| File storage | Documents "View document," mobile "Capture Photo" | S3-compatible bucket + signed URLs |
| Quote/booking-request backend | Portal Approve/Decline, Book Now | Needs to write back to a real record and notify the office side |
| Server-authoritative assignment validation | Dispatch drag-and-drop | Client-side presence check is a fast pre-check only; server must be the real source of truth, per the existing backend gap ledger |

## 7. Maps implementation detail

Both mobile and dispatch use the same mapping library and the same techniques, applied differently. This is the exact stack, not a paraphrase — port these patterns directly.

**Library:** MapLibre GL JS v5, loaded via CDN in the reference files:
```html
<link href="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css" rel="stylesheet" />
<script src="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js"></script>
```
For production, install as a real dependency (`npm install maplibre-gl`) rather than CDN — the reference used CDN only because these are standalone HTML files, not a bundled app. For the Expo/React Native mobile app, MapLibre GL JS does not run directly — use `@maplibre/maplibre-react-native` (the RN binding) instead; the *behavior and data patterns* below still apply, the *API surface* will differ from the JS examples.

**Tile style:** OpenFreeMap's free "liberty" style —
```js
style: 'https://tiles.openfreemap.org/styles/liberty'
```
This is dev-only. Production needs self-hosted tiles (already flagged as an infra gap in the backend architecture doc) — swap the `style` URL for a self-hosted style JSON once that exists. Nothing else in the map code needs to change when that swap happens.

**Markers and popups** (dispatch job/technician pins, mobile job pins):
```js
new maplibregl.Marker({ color: hexForStatus })
  .setLngLat([lng, lat])
  .setPopup(new maplibregl.Popup({ offset: 22 }).setHTML(popupHtml))
  .addTo(map);
```
Marker color is looked up per job from the same status→hex map used for status chips elsewhere in the app — one source of truth for what "urgent" looks like, not a separate map-specific palette. Technician "last known" markers are only ever added for technicians who actually have a `last_known_location` — on-leave/offline technicians get no marker at all, never a stale or greyed-out one. Don't add a marker and hide it with opacity; don't add it in the first place.

**Dark mode (mobile only) — the technique that matters:**
```css
#mapContainer .maplibregl-canvas{
  filter: invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.9) saturate(0.85);
}
```
The filter targets **only** `.maplibregl-canvas` (the actual tile-rendering canvas element), never a parent container. MapLibre renders markers and popups as separate DOM elements layered on top of the canvas, not inside it — filtering the whole container would invert marker colors too and wreck the status-color system. This is a prototyping shortcut (CSS trick, not a real dark map style) — flagged in §3.4 as something to replace with a proper dark style in production, but if it's used as an interim step, this scoping detail is what makes it work correctly.

**Lazy initialization:** the map is only constructed the *first time* its view becomes visible, guarded by an `initialized` flag, not on page/app load:
```js
function initMapIfNeeded(){
  if(mapInitialized){ map.resize(); return; }
  mapInitialized = true;
  map = new maplibregl.Map({ container: 'mapContainer', style, center, zoom });
  // ... markers, layers, error handlers
}
```
Constructing a MapLibre map inside a `display:none` container produces sizing bugs — initialize after the container is actually visible (a `requestAnimationFrame` after the tab switch is enough in the reference), and call `.resize()` on subsequent visits rather than re-constructing.

**Error handling — three distinct failure modes, not one generic "couldn't load":**
```js
if(typeof maplibregl === 'undefined'){ /* script never loaded */ }
const stallTimer = setTimeout(() => { if(!loaded) /* tiles never resolved */ }, 6000);
map.on('error', () => { if(!loaded) /* tile requests failing */ });
map.on('load', () => { loaded = true; clearTimeout(stallTimer); /* add markers */ });
```
Each state gets its own message. This mattered in practice during design review — it correctly distinguished a sandboxed-preview network restriction from an actual broken build, which a single generic "Map failed" message would not have done. Worth keeping in production for the same reason: a customer/technician support report of "map's blank" is far more actionable if the app already knows which of these three states it's in.

**Route optimization (dispatch only) — nearest-neighbor over straight-line distance:**
```js
function routeDist(a, b){ const dx = a.lng - b.lng, dy = a.lat - b.lat; return Math.sqrt(dx*dx + dy*dy); }

function computeRouteOrder(techId){
  const jobs = jobsForTechnicianToday(techId);
  let current = technician.last_known_location ?? jobs[0];
  let remaining = [...jobs];
  const order = [];
  while(remaining.length){
    remaining.sort((a, b) => routeDist(current, a) - routeDist(current, b));
    const next = remaining.shift();
    order.push(next);
    current = next;
  }
  return order;
}
```
This is genuinely computable with no backend — it's plain Euclidean distance between coordinates already on hand, greedily picking the nearest unvisited stop each step. It is **not** road-distance and **not** drive-time, which is why the UI labels it "straight-line distance, not road routing" rather than "optimized route" — a real routing engine (OSRM/Mapbox Directions/Google Routes) is needed for actual road-network paths and ETAs, and that label must not be softened or removed until that capability genuinely exists. The line itself is drawn as a GeoJSON `LineString` via `map.addSource('route', {type:'geojson', data})` and `map.addLayer({id:'route-line', type:'line', ...})`, updated on selection change via `source.setData(...)` rather than removing/re-adding the layer.

## 8. What NOT to change without a deliberate decision
- The point-in-time-only location policy (mobile clock-in/out only, never continuous tracking) is a stated product and privacy commitment, visible in the app's own copy to technicians. Don't quietly add continuous tracking to support a "better" map or route feature — that requires revisiting this decision on purpose, with the copy updated to match, not a silent capability creep.
  - **Real precedent, not a hypothetical:** during implementation, the HQ map's breadcrumb trails and moving vehicle markers were found consuming `liveLocationHistory`/`liveLocations` fed by a telemetry simulator emitting GPS pings every 900ms with a 100-point rolling history — genuine continuous tracking, traced back to the original "breadcrumb support foundation" feature-list bullet rather than a deliberate decision. It was caught before shipping specifically because it was checked against this policy instead of being implemented straight from the feature list. Correction: remove breadcrumb rendering, stop the continuous ingestion entirely (not throttle it), and replace moving markers with `last_known_location` points captured only at clock-in/clock-out. If any future feature list item implies tracking, telemetry, "live," or "breadcrumb," treat that as a flag to check against this section before implementing, not after.
- The status-color reservation (red/amber/green = job status only) — don't reuse these colors for presence, connection state, or anything else, even where it seems convenient.
- The "honest non-wired button" pattern — a styled, responsive button that clearly doesn't claim false success is preferable to either hiding the feature entirely or faking a working backend behind it. When implementing the real backend for any of these, the button should simply start working — the frontend doesn't need to change.
- Route geometry must stay honestly labeled by source. The road-shape adapter (OpenRouteService → OSRM → straight-line fallback) should keep the UI visibly distinguishing which one produced the current route — a successful road-routed call and a straight-line fallback must not render identically.
- The Slack integration's preview banner ("PREVIEW — example data...") must remain visible for as long as the data shown is fabricated rather than pulled from a real connected workspace. Don't remove it to make a demo look more finished, and don't downgrade it to a dismissable one-time toast — it needs to stay in view the whole time the data underneath it isn't real.

## 9. Status: gaps and work-in-progress

A running status check, separate from §6's integration table — this section is about design completeness, not backend wiring. Update this section as items get closed rather than letting status live only in chat history.

### Work-in-progress — something is designed, it's incomplete
- **Customer portal job-status track (§5.2).** Only the fully-complete state exists (`.status-step.done` applied to all four steps in the reference markup). Booked-only, On the way, and In progress states have no visual or logic design yet — needs a "current step" treatment distinct from both done and not-yet-reached.
- **Invoice payment (§5.2).** The "Paid" state is designed; a declined/failed payment state is not. Every other honest-placeholder pattern in this project shows both the success and failure path (the map's three-tier errors, dispatch's drag-and-drop rejection) — this one is happy-path only.
- **Slack OAuth connect (§4.6).** Only the success path is designed — click Connect, land in the preview-connected state. There's no design for the user denying the OAuth consent screen, or the real OAuth call itself failing. Same category of gap as invoice payment: happy path only.

### Not started
- **Real booking flow.** "Book now" on the service-reminder card is a toast placeholder — no date/time picker or availability view has been designed.
- **Photo capture review.** Capture Photo (mobile job detail) has no follow-up UI — no gallery, no "N photos attached" indicator, nothing showing what happens after the button is tapped.
- **Automated review requests.** Identified as a genuinely valuable, cheap-to-build feature in the FSM competitive research this project's feature priorities were based on (post-payment review request, similar shape to the On My Way message pattern in §3.3). Never designed or built in any surface.
- **Editable Automation Routing (§4.6).** The routing pane is read-only — it displays which backend event posts to which channel, but there's no UI for changing that mapping. If the real product wants this configurable rather than fixed, that UI doesn't exist yet.

### Explicitly out of scope (not gaps — decided against, don't reopen without a reason)
Van filtering (redundant given one van per technician), a FieldLoop-native mobile messaging UI (superseded by real Slack access once dispatch's Slack integration is real), a faked Xero "Connected" state (§8), Slack's own OAuth consent and channel-permission screens (that's Slack's UI to design, not FieldLoop's — nothing to build here beyond handling the callback).
