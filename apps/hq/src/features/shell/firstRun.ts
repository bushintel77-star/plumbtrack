/**
 * First-run landing decision: should a signed-in operator be sent into the
 * setup wizard instead of the module the URL names?
 *
 * True only when all three clauses hold — each exists for a reason:
 *
 * - `moduleParam === null`: only a bare `/` is hijackable. An explicit
 *   `?module=` is the operator's own navigation (or our own redirect, which
 *   puts `module=setup` in the URL) — overriding it would fight them and
 *   loop the redirect. This clause is what makes the jump one-shot: once
 *   they leave setup, `module` is set and we never pull them back.
 * - `role` is owner/admin: the setup API is owner/admin only and 403s for
 *   everyone else, so a technician or dispatcher must never be sent into a
 *   wizard they can't use — and AppShell must not even call the endpoint
 *   for those roles.
 * - `setupStatus === "in_progress"`: a finished setup is no reason to
 *   redirect, and an unknown one (the fetch failed) must fall through to
 *   the normal console — a first-run check can never block the console.
 */
export function shouldOpenSetup(input: {
  /** The raw `module` query param — null when the URL is a bare `/`. */
  moduleParam: string | null
  /** Role from GET /api/auth/session. */
  role: string | null
  /** Setup status, or null when unknown/unfetched. */
  setupStatus: "in_progress" | "complete" | null
}): boolean {
  return (
    input.moduleParam === null &&
    (input.role === "owner" || input.role === "admin") &&
    input.setupStatus === "in_progress"
  )
}
