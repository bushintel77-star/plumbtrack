# PlumbTrack component and library map

## Product surfaces

| Surface | Responsibility | Current foundation | Recommended premium layer |
| --- | --- | --- | --- |
| `apps/hq` | Desktop dispatch command center | Next 15, React 19, shadcn/Radix copies, Zustand, dnd-kit, MapLibre, TanStack Query, XState 5 | ReUI/Kibu-inspired presentation primitives, keep domain state in Zustand |
| `apps/web` | Field Agent mobile/PWA | Next 15, React 19, TanStack Query, custom mobile UI | Reuse semantic tokens and accessible primitives; preserve touch-first sheets and offline flows |
| `apps/dispatch` | Electron reference desktop | Vite, React 18, Radix copies, Zustand 4, Lucide | Keep isolated until its React/state baseline is intentionally upgraded |
| `apps/api` | Auth, jobs, operations API | Fastify, Prisma, cookie sessions | No UI library; add OpenTelemetry-compatible server instrumentation at release stage |

## HQ component map

- **Shell:** `AppShell`, toolbar, collapsed navigation, command palette, session/live status.
- **Dispatch orchestration:** `Board`, filters, health strip, suggestions, route optimizer.
- **Planner views:** `DispatchCanvas` (daily timeline), `DispatchViews` (table/list/Gantt), `CalendarView`, `MapView`.
- **Job interaction:** `JobBlock`, queue cards, details surface, timer controls, context menu.
- **Map:** MapLibre renderer, palette, error boundary, telemetry/breadcrumb context.
- **Closed loop:** Slack comms, operations hub, CRM/quote/document/payment surfaces.
- **Primitives:** button, badge, dialog, sheet, command, popover, scroll area, tooltip, toast, separator.

## Field Agent component map

- **Shift execution:** shift cards, log-on/log-off sheets, timer and on-the-way controls.
- **Job execution:** residential job view, job actions sheet, capture bar, signatures, forms.
- **Communication:** messages view, notification feed, search sheet.
- **Closed loop:** documents, daily report, integrations, sync center, project dashboard.
- **Mobile primitives:** glass card, bottom sheet, swipeable card, status chip, skeleton, error boundary, avatar, toast.
- **Resilience:** online status, outbox, sync manager, polling, geolocation.

## Implemented premium layer (2026-08-29)

Watermelon UI visual composition + Kibo UI advanced primitives, hand-ported
onto the Radix/shadcn base and styled exclusively through the FieldLoop
semantic tokens (Tailwind v3 — no registry CLI, no v4 migration; the colour
gate in `apps/hq/scripts/check-color-gate.mjs` enforces token purity):

- **Toast** → Sonner (Watermelon pattern), themed via `--panel-strong` /
  `--app-text` / `--divider-etch` / `--radius`; the `useToast`/`toast` API is
  unchanged for callers.
- **Button** → press-scale + halo focus, gradient primary from
  `--btn-primary-bg`, `shadow-hardware`; adds `xs` / `icon-sm` sizes and
  `data-variant`/`data-size` channels.
- **Inspector (`JobDetailsDialog`) + presentation switch** → `motion`
  (spring entrances, exit animations via AnimatePresence).
- **Skeleton + Empty** (new Tier-1 primitives) — chassis shimmer + dashed
  empty-state composition, wired into the table/list views.
- **Combobox + Tags** (`ui/combobox.tsx`, `ui/tags.tsx`) — Kibo context
  composition over Popover+Command. Combobox is reserved for long option
  lists (client/site pickers); the map crew selector stays a native
  `<select>` deliberately — 4 options, gold-standard keyboard a11y.
- **Table** → Kibo row model on `DispatchTable` (focusable rows, Enter to
  open, per-channel status icon — an active emergency now reads Emergency).
- **Gantt** → now-line through each lane (08:00–18:00 board day), lane hover.
- **Drag lifecycle** → `dispatchMachine` (XState v5) wired through dnd-kit
  via `@xstate/react`; invalid drops never reach the assignment write;
  `data-drag-state` on the board container is the test channel.
- **Coverage** — 30 unit tests (machine transitions, semantic contract,
  table/health-strip/tree components via testing-library+jsdom) and 28 e2e
  specs across board, dispatch views, map, and accessibility.

## Safe upgrade policy

1. Keep Zustand as the source of operational state and TanStack Query as the server cache.
2. Use XState only for explicit UI workflows such as drag lifecycle, sign-in recovery, and sheet transitions.
3. Add ReUI/Kibu components by copying or wrapping individual primitives; do not replace the entire token system.
4. Keep MapLibre, dnd-kit, and Radix because they already match the product's interaction requirements.
5. Align HQ and Field Agent on status tokens, focus treatment, empty states, and sheet behavior before sharing code.
6. Upgrade `apps/dispatch` separately because React 18/Zustand 4 and its Electron runtime are intentionally isolated.

## Priority rollout

### Tier 1
- HQ table/list/Gantt primitives
- Tree navigator for crews/routes/jobs
- Command menu and contextual job sheet
- Shared status badge/icon contract
- Skeleton, error, and empty-state primitives

### Tier 2
- Field Agent swipeable job cards and bottom sheets using the shared semantic contract
- Cross-surface activity timeline
- Accessible map jobs list and route-risk indicators
- Reusable data-grid keyboard model

### Tier 3
- Shared component package after the contracts stabilize
- Visual regression and axe coverage across HQ and Field Agent
- Coordinated library upgrades for Electron

## Explicit non-goals

- No wholesale UI-library migration.
- No replacement of business state with component-local state.
- No unverified dependency upgrades across all apps in one change.
- No production map provider change without credentials, quotas, attribution, and offline requirements.
