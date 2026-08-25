# Contributing

Quick reference for working in this repository. The full project layout and
setup steps live in [README.md](README.md).

## Verification

Run the monorepo checks and suites before considering work done:

```bash
pnpm check        # lint + typecheck across all packages
pnpm test         # unit tests (web + API)
pnpm build        # production build
```

## Commit history notes (August 2026)

Two adjacent commits on `main` split a single polish + feature pass. They are
worth knowing about because the boundary between them is not visible from the
file list alone.

- **`5e3ebd2` — "Remove dead API billing/outbox code and unused schema exports; drop prototype"**
  Despite the title, this commit also contains the responsive-shell polish
  (centered 1120px shell, fixed-footers alignment), the bottom-sheet and
  swipeable-card accessibility work, the `next/font` Lato fix, the dashboard
  Daily Reports navigation, the quote `createQuote` client API, the
  `pnpm check` script, and the deletion of `plumbtrack-prototype.jsx`.

- **`4d826e8` — "Add shift log-on/log-off workflow…"**
  The shift workflow (LogOn/LogOff sheets, ShiftCard, `useShiftTracking`,
  `lib/award.ts`, STP Phase 2 pay split, timesheet views) plus its tests.

**Attribution quirk:** the quote-state wiring that lived in files shared with
the shift work — the `CREATE_QUOTE`/`UPDATE_QUOTE_META` reducer cases, the
`SyncOp` create-quote types, `createQuote`/`updateQuoteMeta` in
`usePlumbTrack`, and the editable quote-builder UI in `PlumbTrack.tsx` — was
staged wholesale by the shift commit and is therefore recorded under
`4d826e8` rather than `5e3ebd2`. All of it is present and tested; only the
commit attribution is mixed.

## Live integrations

### Slack relay (free, no paid plan needed)

Field updates (clock on/off, photos, sign-off, invoices, quotes) relay to a
Slack channel through a server-side incoming webhook. The relay is SSRF-safe:
it only ever calls a literal `https://hooks.slack.com/services/...` URL and is
verified by `apps/api/test/slack.test.ts`.

To go live:

1. Create a free Slack workspace (`slack.com/get-started`) and an incoming
   webhook (`api.slack.com/messaging/webhooks` → Create an Incoming Webhook).
2. Set `SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."` in
   `apps/api/.env` (documented in `.env.example`).
3. Verify in one command: `cd apps/api && pnpm slack:test` — posts a formatted
   block-kit test card and reports delivered/failed.
4. Run the API; `GET /api/health` reports `slack.webhookConfigured`.

With no webhook set, the app runs fully offline (in-app simulation only) and
notifications are persisted for later relay.

## Working in a shared checkout

Multiple agents may edit the same working tree. When a change touches files
another thread is also modifying, stage only your own hunks (e.g. `git add -p`
or `git apply --cached` with a filtered patch) instead of staging whole files,
so related work stays in the right commit. Never stash or discard changes you
did not make, and leave commits unpushed unless asked to push.
