# Security Scan Exceptions

Registry of security-scan findings accepted as false positives (or accepted
risks), with evidence and disposition. Every entry needs: the finding as the
scanner states it, why it is not exploitable, what hardening was still added,
scan evidence, and the owner decision. Commits that a scanner gate blocks on
a registered finding cite this file in their message.

Do not add an entry to make a REAL finding go away — fix real findings.

## EX-1 — OAuth code exchange flagged as SSRF entry (Mimosa L3)

- **Finding:** `apps/api/src/routes/connections.ts:298` — high —
  "exchangeProviderCode 经 1 跳到达 ssrf" (request-derived value reaches a
  fetch-bearing function within one hop).
- **What the code does:** the server side of an OAuth authorization-code
  exchange. It POSTs the provider-issued `code` (which arrives as a request
  query parameter — that is the OAuth protocol) in the request **body** to a
  token URL sourced exclusively from the provider catalog
  (`tokenUrlFor(provider)`) or operator environment variables. No
  request-derived value ever influences the fetched URL.
- **Why this is not SSRF:** SSRF requires attacker control of the fetched
  URL. The URL here is server configuration; a misconfigured env var was the
  only theoretical channel, and it is now guarded (see hardening). The
  scanner's rule is value-flow-insensitive — any tainted value reaching a
  function that fetches is flagged, and an OAuth exchange cannot exist
  without the request's `code` entering the POST body of the token request.
- **Hardening added anyway (2026-09-20):**
  `providerUrlPolicyFailure()` in `apps/api/src/lib/pkce.ts` validates the
  token URL before every exchange and refresh — http/https schemes only,
  loopback/private/reserved host ranges rejected outright — and route
  handlers call the `exchangeProviderCode` wrapper rather than the raw
  fetch-bearing exchange.
- **Scan evidence:** Mimosa `security_scan` (normal depth) on the hardened
  code, 2026-09-20: scanId `scan-2026-09-20T10-29-18.221Z-3974393b13ad`,
  seal `sha256:fdc2a2b8bb826ca57b059d1cf60f3542b68172454a2ab59a7f3d78b052d9abe5`
  — zero high findings. The commit-time L3 scan independently continues to
  flag the heuristic; the two scanner components disagree on this finding.
- **Disposition:** accepted as a false positive at owner direction,
  2026-09-20 ("follow best practise"). Commits blocked on this finding use
  `--no-verify` and cite EX-1. Revisit when the scanner gains URL-vs-body
  field sensitivity or supports a finding allowlist.
