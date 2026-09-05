import { describe, expect, it } from "vitest"

import { advanceStyleLadder, isFatalMapError, MAX_STYLE_LADDER_PASSES } from "@/lib/basemapLadder"

describe("advanceStyleLadder (basemap failure ladder)", () => {
  const TWO_CANDIDATES = 2

  it("walks candidates within a pass before restarting the ladder", () => {
    expect(advanceStyleLadder({ styleIndex: 0, ladderPass: 0 }, TWO_CANDIDATES)).toEqual({
      styleIndex: 1,
      ladderPass: 0
    })
    expect(advanceStyleLadder({ styleIndex: 1, ladderPass: 0 }, TWO_CANDIDATES)).toEqual({
      styleIndex: 0,
      ladderPass: 1
    })
  })

  it("restarts from the first candidate on every fresh pass", () => {
    for (let pass = 1; pass < MAX_STYLE_LADDER_PASSES - 1; pass++) {
      expect(advanceStyleLadder({ styleIndex: TWO_CANDIDATES - 1, ladderPass: pass }, TWO_CANDIDATES)).toEqual({
        styleIndex: 0,
        ladderPass: pass + 1
      })
    }
  })

  it("gives up only after every candidate failed in every pass", () => {
    const lastPass = MAX_STYLE_LADDER_PASSES - 1
    expect(advanceStyleLadder({ styleIndex: 0, ladderPass: lastPass }, TWO_CANDIDATES)).toEqual({
      styleIndex: 1,
      ladderPass: lastPass
    })
    expect(advanceStyleLadder({ styleIndex: TWO_CANDIDATES - 1, ladderPass: lastPass }, TWO_CANDIDATES)).toBe(
      "give-up"
    )
  })

  it("handles a single-candidate deployment (self-hosted style only)", () => {
    expect(advanceStyleLadder({ styleIndex: 0, ladderPass: 0 }, 1)).toEqual({ styleIndex: 0, ladderPass: 1 })
    expect(advanceStyleLadder({ styleIndex: 0, ladderPass: MAX_STYLE_LADDER_PASSES - 1 }, 1)).toBe("give-up")
  })
})

describe("isFatalMapError", () => {
  it("treats tile and sprite failures as non-fatal — MapLibre retries those itself", () => {
    expect(isFatalMapError({ error: new Error("fetch failed") })).toBe(false)
    expect(isFatalMapError({ error: { message: "Not Found", status: 404 } })).toBe(false)
    expect(isFatalMapError({})).toBe(false)
  })

  it("treats WebGL loss, auth failures and dead styles as fatal", () => {
    expect(isFatalMapError({ error: new Error("WebGL context lost") })).toBe(true)
    expect(isFatalMapError({ error: { message: "Forbidden", status: 403 } })).toBe(true)
    expect(isFatalMapError({ error: { message: "Unauthorized", status: 401 } })).toBe(true)
    expect(isFatalMapError({ error: new Error("Style failed to load") })).toBe(true)
  })
})
