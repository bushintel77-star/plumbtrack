# FieldLoop Design References & Component Matrix

**Status:** Approved design direction  
**Audience:** Product, design, frontend, mobile, QA  
**Updated:** August 2026

## Purpose

FieldLoop is a mobile-first field-service application for plumbing technicians working outdoors, in buildings, with gloves, unreliable connectivity, and limited attention. Dispatch HQ is the desktop coordination surface for the same closed-loop job record.

The product direction is **industrial/utilitarian instrument panel**: distinctive enough to feel like a trade tool, restrained enough to keep status, safety, time, and evidence legible.

## Research references

- [Muzli — Mobile App Design Trends 2026](https://muz.li/blog/whats-changing-in-mobile-app-design-ui-patterns-that-matter-in-2026/)
- [Muzli — Dashboard Design Examples for 2026](https://muz.li/blog/best-dashboard-design-examples-inspirations-for-2026/)
- [Pixelmatters — 7 UI Design Trends to Watch in 2026](https://www.pixelmatters.com/insights/7-UI-design-trends-to-watch-in-2026)
- [925 Studios — SaaS Dashboard Design Examples 2026](https://www.925studios.co/blog/saas-dashboard-design-examples-2026)
- [ASAPP Studio — Admin Dashboard Designs 2026](https://www.asappstudio.com/admin-dashboard-designs-2026/)

These references are inspiration and evaluation criteria, not instructions to copy a visual style. Field safety, outdoor legibility, offline reliability, and predictable workflows take priority over trend adoption.

## Design specification

### 1. Purpose statement

A plumbing technician must execute one job at a time with minimal attention: log on, navigate, arrive, work, capture evidence, obtain approval, complete the job, and leave. A dispatcher must coordinate the full day from a planner-first desktop board.

### 2. User context and constraints

- Outdoor/indoor work, glare, noise, wet or dirty hands, gloves.
- Offline-first operation is mandatory; queued work must remain honest and recoverable.
- Phone-first field UI with one-handed use; desktop HQ uses higher density.
- Emergency and regulated work require clear precedence and evidence.
- GPS/time capture must be explicit and privacy-preserving.

### 3. Aesthetic direction

**Industrial/utilitarian instrument panel.** Steel surfaces (dark or light Blueprint), high-contrast operational data, restrained blue interaction chrome, semantic status colors, and display typography used as an instrument readout rather than decoration.

### 4. Color system

Two colourways share the same semantic law and chrome ramp — the operator switches between them with a persisted toggle:

**Dark — Hardware Chassis** (default for the field agent; the mobile FSM app ships this):

- `#0A0E13` — chassis background
- `#131A21` — primary surface
- `#1A232C` — elevated surface
- `#26323C` — divider/etch
- `#4F90FF` — interaction and focus accent (chrome glow)

**Light — Blueprint** (light theme on mobile; the dispatch HQ default):

- `#EEF1F2` — canvas/background
- `#FFFFFF` — panel surface
- `#F8F9FA` — recessed surface
- `#DDE3E7` — divider/etch
- `#2F6FED` — interaction and focus accent; chrome ramp `#1E56E0 / #4E8CFF / #B8D8FF`

Semantic status system (theme-invariant meaning; hues shift only for contrast):

- Teal — active/billing now (the ONLY live color)
- Amber — pending, queued, delayed, attention
- Red — urgent, failed, emergency
- Green — complete/safe
- Muted chrome — scheduled, neutral, en route

Status always uses color + icon + label. Color alone is never sufficient.

### 5. Typography

- **Big Shoulders Display** — wordmark, hero counts, completion moments.
- **IBM Plex Sans** — primary interface copy.
- **IBM Plex Mono** — timestamps, status labels, queue data, tabular timers.
- Minimum field body/data size: 13px-equivalent; critical controls use large labels and 44–56px touch targets.

### 6. Layout strategy

- Stable working-screen grid; creative license belongs to clock-in, onboarding, and completion moments.
- Primary actions remain in the lower thumb zone.
- Bottom sheets contain temporary secondary content.
- One active contextual surface at a time.
- Main job and planner surfaces remain readable without opening a panel.

## Reference-to-component matrix

| Research principle | Product interpretation | FieldLoop component / surface | Dispatch HQ component / surface | Acceptance check |
| --- | --- | --- | --- | --- |
| North-star metric/state first | Show what needs attention now | `InstrumentHeader`, current job focus | `DecisionStrip`, active job/timer summary | First glance identifies current state and next action |
| Progressive disclosure | Show essentials, reveal detail on demand | Job detail, `SyncSheet`, sign-off review | Job detail sheet, route drawer, queue sheet | No persistent secondary panel competes with the main surface |
| Doing vs analyzing | Separate execution from reports | Job screen and shift screen | Planner/List/Map vs analytics/reporting | Operator can complete core action without opening analytics |
| Actionable cards | Explain state and expose one useful action | Job card, evidence card, checklist row | Exception card, unassigned card, conflict card | Each alert answers what, why, and what next |
| Thumb-first interaction | Put high-frequency actions within reach | Bottom job action rail, bottom sheets | N/A on desktop; tablet uses bottom/right contextual surface | Critical actions are reachable one-handed and remain labeled |
| Bottom-sheet secondary content | Temporary context should not become navigation | Sign-off, sync exception, photo review | Job detail, route conflict, map context sheet | Open/close is reversible and focus/reading order is preserved |
| Gesture discoverability | Gestures accelerate but never gatekeep | Signature pad clear/save, visible action buttons | Drag/drop plus keyboard alternative | Every gesture has a visible accessible fallback |
| Haptics as confirmation | Feedback confirms committed state transitions | `haptics.ts`, arrival, timer, sign-off, complete | Motion/transition feedback for drag lifecycle | State changes remain visible without relying on haptics |
| Dark-first tonal depth | Use surfaces and borders instead of heavy shadows | `global.css`, `bg-surface`, `bg-overlay` | HQ semantic chassis tokens | At least four readable surface levels; no glare-heavy default |
| Restrained glass | Glass means temporary layer, not every card | Sign-off/sync/photo sheets only | Map/job temporary sheets only | Core data remains opaque and legible |
| Real-time visibility | Live state is operational truth | `SyncBadge`, NetInfo actor, live stream | live board updates, timer, map telemetry | Live/offline/reconnecting states are explicit |
| Offline-first | Local save precedes transmission | Watermelon cache + outbox + sync manager | Offline queue/connection surfaces | Restart and reconnect preserve work exactly once |
| Role/context adaptation | Emphasize next action without moving the mental model | Off shift/current job/completion states | Dispatcher vs manager views and exception priority | Familiar controls stay in stable locations |
| Global filters | Avoid duplicated filter stacks | Jobs search/filter surface | Date, crew, status, route, zoom controls | One global filter updates the active view consistently |
| Spatial context | Use maps only where geography helps decisions | Map tab and navigation handoff | MapLibre, routes, proximity ranking, map-to-timeline | Map includes accessible list fallback and clear legend |
| Self-contained data widgets | Explain metrics without forcing navigation | Payable summary, sync counts | Health strip, route risk, active jobs | Widget includes timestamp/context and action where relevant |
| Honest status color | Semantic color communicates state, not decoration | `StatusChip`, photo/sign-off states | `JobBlock`, map palette, list badges | Icon + label accompany every status color |
| Messy-data resilience | Design for missing GPS, errors, queue failures | Offline/error/failed evidence states | unassigned, conflict, overdue, sync exception states | Empty/error states direct recovery instead of dead-ending |
| AI as prioritization | Suggestions support, never silently decide | Future note/service suggestions | Future eligible-crew/routing suggestions | Recommendation includes reason, confidence, and explicit action |

## Component rules

### FieldLoop

- `InstrumentHeader`: persistent brand, shift/location honesty, live connection.
- `SyncBadge` / `SyncSheet`: automatic sync indicator and exception recovery; never a manual sync destination.
- Job detail: one job, one next action, checklist/evidence/timer in predictable order.
- `SignaturePad`: touch capture with clear and save controls; signature status is queued/synced/failed.
- Bottom action rail: start/stop clock, capture, sign-off, complete.
- WatermelonDB/outbox: local data and mutation durability; UI never claims server success from a local write alone.

### Dispatch HQ

- `DecisionStrip`: emergency, unassigned, conflict, overdue, and sync counts.
- `DispatchCanvas` / timeline: primary planning surface with compact solid chips and keyboard/drag interaction.
- Tree navigator: shared crew → route → job index with typeahead and arrow navigation.
- Map surface: route/proximity context, accessible synchronized job list, and exact selection reveal.
- One contextual sheet: selected job, queue, conflict, route, or map detail—never several persistent inspectors.

## Motion and accessibility contract

- Respect reduced-motion preferences.
- Never require color, hover, or gesture as the only way to understand or complete work.
- Maintain visible focus and minimum touch targets.
- Use semantic labels for status, sync, GPS, signature, and completion.
- Confirm destructive or financially material actions in a review sheet.

## Review checklist

Before shipping a new surface, confirm:

- Does it show the next useful action?
- Is the default view calm enough to scan in two seconds?
- Does it work offline and explain queue state honestly?
- Are status color, icon, and label consistent?
- Is secondary detail progressively disclosed?
- Is the primary action reachable by thumb or keyboard?
- Does the design still work with missing, late, failed, or duplicated data?
- Is the component mapped to a semantic token rather than a raw color?
