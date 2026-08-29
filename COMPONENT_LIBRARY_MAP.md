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
