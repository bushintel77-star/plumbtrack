import { describe, expect, it } from "vitest"

import { NAV, visibleNav } from "@/features/shell/nav"

/**
 * Nav role filter contract: `setup` is company setup — the API gates its
 * writes to owner/admin — so the entry only exists for them. A technician
 * who could click it would hit an error screen; a dispatcher would read
 * the company's answers in a form whose saves all 403. Every other module
 * is untouched, and a null/unknown role gets the non-setup list.
 */

describe("visibleNav", () => {
  it("includes setup for an owner", () => {
    expect(visibleNav("owner").map(item => item.id)).toContain("setup")
  })

  it("includes setup for an admin", () => {
    expect(visibleNav("admin").map(item => item.id)).toContain("setup")
  })

  it("hides setup from field and non-admin office roles", () => {
    for (const role of ["technician", "dispatcher", "manager", "accountant"]) {
      expect(visibleNav(role).map(item => item.id)).not.toContain("setup")
    }
  })

  it("hides setup for a null/unknown role", () => {
    expect(visibleNav(null).map(item => item.id)).not.toContain("setup")
    expect(visibleNav("bogus-role").map(item => item.id)).not.toContain("setup")
  })

  it("never drops any other module", () => {
    const withoutSetup = NAV.filter(item => item.id !== "setup").map(item => item.id)
    expect(visibleNav("owner").map(item => item.id)).toEqual(NAV.map(item => item.id))
    expect(visibleNav(null).map(item => item.id)).toEqual(withoutSetup)
  })

  it("hides integrations from roles that can neither connect nor retry", () => {
    // Connect writes are admin+ and delivery retries are office — a
    // technician or accountant would only see a wall of 403s.
    const expected = NAV
      .filter(item => item.id !== "setup" && item.id !== "integrations")
      .map(item => item.id)
    expect(visibleNav("technician").map(item => item.id)).toEqual(expected)
    expect(visibleNav("accountant").map(item => item.id)).toEqual(expected)
    // Office roles keep it.
    expect(visibleNav("dispatcher").map(item => item.id)).toContain("integrations")
    expect(visibleNav("manager").map(item => item.id)).toContain("integrations")
  })
})
