import { afterEach, describe, expect, it, vi } from "vitest"

import { fetchRoadShape, routeSignature, type LngLat } from "@/lib/roadShape"

/**
 * roadShape now calls the authenticated API proxy (/api/routing/shape) —
 * never a routing provider directly. The only stub here is our own API
 * boundary (no API server exists in the unit environment); the proxy itself
 * is covered by zero-mock live tests on the api side.
 */

/** Distinct coordinates per test so the module-level cache never bleeds between cases. */
let seq = 0
function chain(): LngLat[] {
  seq += 1
  return [
    [144.96 + seq / 1000, -37.82],
    [145.0 + seq / 1000, -37.88],
    [145.03 + seq / 1000, -37.84]
  ]
}

const proxyResponse = (coords: LngLat[]) => ({
  ok: true,
  json: async () => ({ coordinates: coords, source: "osrm" })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("fetchRoadShape (authenticated routing proxy)", () => {
  it("asks the API proxy with the encoded stop chain and caches per signature", async () => {
    const stops = chain()
    const road: LngLat[] = [[144.96, -37.82], [144.971, -37.825], [144.983, -37.83], [145.0, -37.88]]
    const fetchMock = vi.fn().mockResolvedValue(proxyResponse(road))
    vi.stubGlobal("fetch", fetchMock)

    await expect(fetchRoadShape(stops)).resolves.toEqual(road)
    // Second call for the same chain is served from cache — no new request.
    await expect(fetchRoadShape(stops)).resolves.toEqual(road)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain("/api/routing/shape?stops=")
    expect(url).toContain(encodeURIComponent(stops.map(([lng, lat]) => `${lng},${lat}`).join(";")))
    // Authenticated call shape: cookie credentials ride along.
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "include" })
  })

  it("resolves null when the proxy is unreachable, without caching — a later board change retries", async () => {
    const stops = chain()
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("API down"))
      .mockResolvedValueOnce(proxyResponse([[144.96, -37.82], [145.0, -37.88]]))
    vi.stubGlobal("fetch", fetchMock)

    await expect(fetchRoadShape(stops)).resolves.toBeNull()
    await expect(fetchRoadShape(stops)).resolves.not.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("resolves null when the proxy answers without usable coordinates", async () => {
    const stops = chain()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ coordinates: [] }) })
    vi.stubGlobal("fetch", fetchMock)

    await expect(fetchRoadShape(stops)).resolves.toBeNull()
  })

  it("never calls the proxy for degenerate chains (fewer than two distinct stops)", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await expect(fetchRoadShape([[144.96, -37.82]])).resolves.toBeNull()
    // Two stops that round to the same ~100 m cell dedupe down to one point.
    await expect(fetchRoadShape([[144.96001, -37.82001], [144.96002, -37.82002]])).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("routeSignature is stable under sub-100 m coordinate noise", () => {
    expect(routeSignature([[144.96001, -37.82001], [145.0, -37.88]])).toBe(
      routeSignature([[144.96002, -37.82002], [145.0, -37.88]])
    )
  })
})
