# Production readiness — WIP and gap register

Updated: 2026-08-29

## Current WIP

| Area | Current state | Evidence |
|---|---|---|
| HQ dispatch board | Functional prototype with matrix, list, calendar, map, filters, drag/drop, queue, routing suggestions, timers, and health strip | HQ build and unit suite pass |
| Semantic status system | Shared status tokens, precedence (emergency > delayed > state), icons, map palette bridge, and color gate are implemented | HQ lint/color gate and status tests pass |
| Premium UI layer | Watermelon composition (Sonner toast, motion inspector/view transitions, button polish, skeleton/empty) + Kibo primitives (combobox, tags, table row model, gantt now-line), all token-pure; drag lifecycle driven by the XState dispatch machine with `data-drag-state` channel | 30 unit + 28 e2e green (dispatchViews, board, map, accessibility suites) |
| Map | MapLibre map with token-backed pins, road-shape upgrade, routes, breadcrumbs, hover popup, accessible jobs list, and error fallback | Map palette/road-shape tests pass |
| Authentication | API HTTP-only session issuance, renewal, sign-out, and cookie-aware HQ client are implemented | API auth tests pass |
| Connectivity | REST demo fallback, offline queue foundation, telemetry reconnect/backoff, and simulator path exist | Typecheck/build/tests pass |
| Operations | API-backed CRM/quote/document/integration summary surface exists | HQ build/typecheck pass |

## Blocking gaps to production completion

### P0 — must close before live operations

1. **Server-authoritative assignment**: endpoint and HQ mutation client are now scaffolded, but appointment existence, crew/skill/absence validation, and concurrent conflict enforcement still require completion before release.
2. **Real HQ authentication UX**: add enrollment/sign-in flow, session-expired route state, role-aware access control, and secure production bootstrap configuration. Do not rely on demo fallback in production.
3. **Production map infrastructure**: provide authenticated/self-hosted tile configuration, routing quotas, timeout budgets, attribution, and a tested offline style fallback. Public demo routing/tile services cannot be the production dependency.
4. **Release validation**: run full Playwright against a production start with API authentication, map accessibility, assignment rollback, timer compliance, and no console errors.
5. **Observability**: add structured client/API error reporting, correlation IDs in UI diagnostics, health/readiness checks, and alerting for integration delivery failures.

### P1 — required for a complete FSM loop

1. Board aggregate endpoint (`GET /api/board?date=`) returning jobs, appointments, timers, and crew availability atomically.
2. HQ CRM/customer/property CRUD and appointment management.
3. API-backed quote line editing, send/approval state, invoice/payment status, and webhook history.
4. Document upload, versioning, preview, expiry workflow, and RFI UI.
5. Server-backed Slack channel/message history, posting, retry, and dead-letter controls.
6. Accounting/job costing, tax, reconciliation, and payroll export.
7. True route optimization service with road matrix, traffic/window costs, and auditable suggestions.
8. Full breadcrumb retention policy, privacy controls, and mileage/expense exports.

### P2 — scale and polish

1. Split board/UI/test state and remove the global test bridge from production bundles.
2. Replace broad high-frequency Zustand subscriptions with selectors/feature-state updates.
3. Add axe scans and full keyboard traversal tests for every Dispatch workflow.
4. Add responsive/mobile operator layout and reduced-motion visual QA.
5. Remove monorepo build warnings and standardize CI/package-manager configuration.
6. Add backup/restore, migration, rate-limit, retention, and incident runbooks.

## Acceptance criteria for declaring production-ready

- All P0 items closed and demonstrated in a clean production-start environment.
- No unauthenticated access to tenant data or mutations.
- Assignment and status mutations are server-authoritative and auditable.
- Map remains usable when tiles/routing are unavailable.
- Every status is communicated by icon, text, and semantic color.
- Full HQ/API typecheck, lint, unit, and Playwright suites pass with zero unexpected console errors.
- Deployment configuration, environment variables, rollback procedure, and operational alerts are documented.

## Verified current checks

- HQ lint + semantic color gate: passed
- HQ typecheck: passed
- HQ production build: passed
- HQ unit tests: 19/19 passed
- API typecheck: passed
- API tests: 96/96 passed

The system is a strong validated prototype; it should not be represented as fully production-ready until the P0 server-authority, authentication UX, infrastructure, observability, and release-validation gaps are closed.
