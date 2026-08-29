# PlumbTrack Field Agent (HeroUI Native, v1)

Mobile FSM interface for Caulfield South Plumbing technicians — the HeroUI
Native (Expo 57 / React Native 0.86) field client on the FieldLoop semantic
tokens. Standalone by design: this folder owns its lockfile and is isolated
from the parent pnpm workspace (`pnpm-workspace.yaml` boundary marker).

Built from the `create-heroui-native-app` expo-tabs scaffold (Expo +
[HeroUI Native](https://heroui.com/docs/native) +
[Uniwind](https://docs.uniwind.dev) + Expo Router).

## Design specification (mobile-fsm-ui-design)

- **Purpose**: plumber-technician executing the day one-handed — shift
  log-on/off (MA000036), today's jobs, billing-accurate per-job timers,
  photo evidence, completion.
- **Direction**: industrial / utilitarian — instrument panel for the
  toolbelt; Hardware Chassis (dark) is the only v1 colourway.
- **Colour** (FieldLoop via the HeroUI CSS-variable bridge in
  `src/global.css`): teal = billing now (the ONLY live colour), red =
  urgent/emergency, amber = attention/queued, green = complete, chrome =
  interactive. Status is always colour + icon + label.
- **Type**: Lato (UI) + JetBrains Mono (labels, tabular timer digits).
- **Offline-first**: every write queues in the outbox (op id = server
  idempotency key); the Sync tab is the honesty screen (queued / failed /
  last synced). Terminal 4xx parks for an explicit retry/discard.
- **Location honesty**: one-shot GPS evidence at log-on and captures only —
  the app never streams location.

## Core loop

Tabs: **Day** (log on with work type, live payable preview via
`interpretShift`, log-off sheet with the MA000036 breakdown) → **Jobs**
(today's work, emergency first, search, pull-to-refresh) → job detail
(call/access, billing clock, parts, photo capture, complete).

## Live data

There is no Sync tab and no manual sync. The app holds one WebSocket to the
API's `/api/stream` (token-authenticated, org-scoped); job events — created,
updated, status, remote clock activity — apply to the board as they happen.
On reconnect the board reconciles with a fresh pull, so missed frames never
leave stale state. Outbox draining was always automatic (5s flush loop);
the badge in every header shows `LIVE` / `CONNECTING` / queued counts, and
tapping it opens the exception sheet for the rare write that needs a human
decision (terminal 4xx → retry/discard). In demo mode a simulator drives
the exact same apply path every ~15s, so live behaviour demos with zero
backend.

## State & durability (XState v5)

The shift lifecycle is an XState v5 statechart (`src/lib/shiftMachine.ts`) —
illegal sequences are structurally impossible (no break without a shift, no
double log-on, log-off from any active state with open breaks closed for
award interpretation). The machine snapshot persists to AsyncStorage on
every transition and restores on boot: a crash mid-shift never costs the
technician their payable time. Commit feedback is tactile — differentiated
haptic patterns fire on every transition (heavy for shift bookends, medium
for job clocks, light for breaks) because gloves defeat subtler cues.
Failed outbox writes roll back their optimistic board patch on DISCARD.

### Deliberate divergences from the 2026 stack recipe

- **No hard `isNetworkReady` / `isLocationVerified` guards** — offline-first
  means network is never a precondition (everything queues), and GPS-denied
  log-on stays legal with honest nulls recorded; award evidence is captured
  when available, never blocking.
- **No GPS breadcrumb actors** — the app's visible promise is
  point-in-time evidence only, never continuous tracking; HQ telemetry
  upstream is a separate, explicit v2 decision.
- **AsyncStorage, not SQLite, for the shift snapshot** — one serialized
  statechart doesn't justify a database; the outbox is the scaling path.
- **Card-edge definition instead of expo-blur glass** — working screens
  stay flat and high-contrast for outdoor legibility; elevation comes from
  `border-line` highlights on the dark chassis.

### Offline-first data layer (WatermelonDB)

The board lives in a local WatermelonDB database — jobs render from the
cache at boot (offline with a prior sync = the day's work already on
screen), `synchronize()` pulls server state on a Watermelon-contract
endpoint (`GET /api/sync`), and live-stream frames write through to the
cache. **Writes keep the outbox** (opId idempotency, discard-rollback);
`pushChanges` is a no-op by design — full two-way sync needs tombstones in
the Prisma schema first.

**Adapters (platform-split):** SQLiteAdapter (JSI) on native dev builds;
LokiJSAdapter on web. **Expo Go no longer runs this app** — the SQLite
adapter is a native module. Run on device via a development build:

```bash
npx expo run:android          # local dev build (Android SDK required)
eas build --profile development --platform android   # or EAS
```

Web preview still works (`pnpm start --web`, LokiJS persistence).

## Known issue: web-preview dev toast (colorKit)

On the **web preview only**, HeroUI Native's press-feedback path feeds
colorKit token values that browsers compute from `color-mix()` into
`oklch()`/`color()` strings its parser rejects — a dev-mode error toast
appears on some button presses. Functionality is unaffected (the fallback
renders and every flow works). Mitigations landed: a pnpm patch
(`patches/heroui-native.patch`) replaces the button-path color-mix tokens
with parseable rgba values and enriches the error text for diagnosis.
The residual toast comes from uniwind's variable resolution on web and
needs an upstream fix; verify on a device (Expo Go) — the native path has
no CSS cascade and should not exhibit it.

## Run

```bash
pnpm install
EXPO_PUBLIC_FORCE_DEMO=1 pnpm start   # demo mode, no backend needed
pnpm start                            # live: EXPO_PUBLIC_API_URL pointed at the Fastify API
```

Scan the Expo Go QR from your phone (primary dev path on Windows — no
emulator is required to be configured here).

## Gate

`pnpm typecheck && pnpm lint && pnpm test` — plus `npx expo export
--platform android` as the headless compile proof (Hermes bundle, ~4.3k
modules). Unit specs pin the award engine (OT tiers, call-back minimum,
clause 16.5, TOIL/STP split) and outbox semantics (retryable vs terminal,
backoff envelope).

## Not in v1

Signature pad, voice notes, checklists, quotes/payment, live-location
streaming upstream to HQ (the API channel now exists — wiring the field
device's telemetry into it is v2), light colourway, monorepo adoption.
