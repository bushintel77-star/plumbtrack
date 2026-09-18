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
    expect(visibleNav("technician").map(item => item.id)).toEqual(withoutSetup)
    expect(visibleNav(null).map(item => item.id)).toEqual(withoutSetup)
  })
})
