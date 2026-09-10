# FieldLoop design references — CANONICAL

The mockups + implementation spec are the approved design baseline for all
three surfaces. They are versioned HERE so design intent can never again
live outside the codebase (that is exactly how duplicate/legacy development
happened before 2026-09-11).

- `fieldloop-implementation-spec.md` — the implementation spec (§3 mobile,
  §4 dispatch incl. §4.6 Slack, §5 customer portal). Read the STATUS banner
  at the top first: it records dated amendments (e.g. the §8 location-policy
  supersession).
- `fieldloop-mockup-technician.html` — technician app design reference
  (implemented: FieldLoop field agent, plumbtrack-mobile).
- `fieldloop-mockup-dispatch.html` — dispatch console design reference
  (implemented: apps/hq FieldLoop workspace; day/week/month + some panes
  remain the gap — see PRODUCTION_READINESS.md).
- `fieldloop-mockup-customer-portal.html` — customer portal design
  reference (NOT yet built; spec §5 — new standalone surface).
