import { describe, expect, it } from "vitest"

import { shouldOpenSetup } from "@/features/shell/firstRun"

/**
 * First-run landing contract: a signed-in owner/admin arriving on a bare `/`
 * with setup still in progress is sent into the wizard. Every clause is
 * load-bearing — an explicit `?module=` is the operator's own navigation,
 * the setup API 403s non-admin roles, and an unknown setup state must fall
 * through to the normal console rather than block it.
 */

describe("shouldOpenSetup", () => {
  it("redirects a bare-`/` owner with setup in progress", () => {
    expect(shouldOpenSetup({ moduleParam: null, role: "owner", setupStatus: "in_progress" })).toBe(true)
  })

  it("redirects an admin the same way", () => {
    expect(shouldOpenSetup({ moduleParam: null, role: "admin", setupStatus: "in_progress" })).toBe(true)
  })

  it("never overrides an explicit module — even mid-setup, even for an owner", () => {
    expect(shouldOpenSetup({ moduleParam: "dispatch", role: "owner", setupStatus: "in_progress" })).toBe(false)
    // "setup" explicit: the redirect's own destination — this clause is what
    // stops the jump from looping once the wizard is showing.
    expect(shouldOpenSetup({ moduleParam: "setup", role: "owner", setupStatus: "in_progress" })).toBe(false)
  })

  it("never sends field/office roles into a wizard the API 403s for them", () => {
    for (const role of ["technician", "dispatcher", "manager", "accountant"]) {
      expect(shouldOpenSetup({ moduleParam: null, role, setupStatus: "in_progress" })).toBe(false)
    }
  })

  it("does not redirect a completed setup", () => {
    expect(shouldOpenSetup({ moduleParam: null, role: "owner", setupStatus: "complete" })).toBe(false)
  })

  it("does not redirect when setup status is unknown — a failed fetch falls through to the console", () => {
    expect(shouldOpenSetup({ moduleParam: null, role: "owner", setupStatus: null })).toBe(false)
  })

  it("does not redirect when the role is unknown", () => {
    expect(shouldOpenSetup({ moduleParam: null, role: null, setupStatus: "in_progress" })).toBe(false)
  })
})
