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

## Working in a shared checkout

Multiple agents may edit the same working tree. When a change touches files
another thread is also modifying, stage only your own hunks (e.g. `git add -p`
or `git apply --cached` with a filtered patch) instead of staging whole files,
so related work stays in the right commit. Never stash or discard changes you
did not make, and leave commits unpushed unless asked to push.
