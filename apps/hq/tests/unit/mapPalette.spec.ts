import { describe, expect, it } from "vitest"

import { resolvePalette } from "@/features/map/palette"

describe("resolvePalette (Tier-1 token bridge for WebGL paints)", () => {
  it("passes computed token values through, trimmed", () => {
    const palette = resolvePalette(token => ({ "--status-active": " #14b8a6 " }[token] ?? ""))
    expect(palette.active).toBe("#14b8a6")
    expect(palette.active).toBe("#14b8a6")
    expect(palette.vehicle).toBe("#14b8a6")
  })

  it("falls back to the dark-chassis value when a token is unreadable", () => {
    const palette = resolvePalette(() => "")
    expect(palette.urgent).toBe("#ff3b30")
    expect(palette.complete).toBe("#32d74b")
    expect(palette.neutral).toBe("#8b94a6")
    expect(palette.pinStroke).toBe("#071022")
    expect(palette.highlightStroke).toBe("#ffffff")
    expect(palette.breadcrumb).toBe("#4e8cff")
  })

  it("maps person identity tokens in crew order", () => {
    const palette = resolvePalette(token =>
      ({
        "--person-1": "#c27878",
        "--person-2": "#7a9e7e",
        "--person-3": "#b08d57",
        "--person-4": "#6b7d8d"
      })[token] ?? ""
    )
    expect(palette.people).toEqual(["#c27878", "#7a9e7e", "#b08d57", "#6b7d8d"])
  })
})
