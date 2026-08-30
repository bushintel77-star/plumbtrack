import { describe, expect, it } from "vitest"

import { fuzzyMatch } from "@/features/fieldloop/Palette"

describe("command palette fuzzy match", () => {
  it("matches out-of-order gaps as an ordered subsequence", () => {
    expect(fuzzyMatch("bwh", "Backflow test — Warehouse")).toBe(true)
    expect(fuzzyMatch("hwb", "Backflow test — Warehouse")).toBe(false)
  })

  it("ignores case and whitespace in the query", () => {
    expect(fuzzyMatch(" MA ya ", "Maya Chen")).toBe(true)
  })

  it("treats an empty query as matching everything", () => {
    expect(fuzzyMatch("", "anything")).toBe(true)
  })

  it("rejects characters the candidate does not contain", () => {
    expect(fuzzyMatch("zz", "Maya Chen")).toBe(false)
  })
})
