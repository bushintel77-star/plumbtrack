import { afterEach, describe, expect, it, vi } from "vitest"

import { fetchRoadShape, routeSignature, type LngLat } from "@/lib/roadShape"

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

const osrmResponse = (coords: LngLat[]) => ({
  ok: true,
  json: async () => ({ routes: [{ geometry: { coordinates: coords } }] })
})

const orsResponse = (coords: LngLat[]) => ({
  ok: true,
  json: async () => ({ features: [{ geometry: { coordinates: coords } }] })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("fetchRoadShape (free routing tiers)", () => {
  it("uses the keyless OSRM demo tier and caches the shape per stop chain", async () => {
    const stops = chain()
    const road: LngLat[] = [[144.96, -37.82], [144.971, -37.825], [144.983, -37.83], [145.0, -37.88]]
    const fetchMock = vi.fn().mockResolvedValue(osrmResponse(road))
    vi.stubGlobal("fetch", fetchMock)

    await expect(fetchRoadShape(stops)).resolves.toEqual(road)
    // Second call for the same chain is served from cache — no new request.
    await expect(fetchRoadShape(stops)).resolves.toEqual(road)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain("https://router.project-osrm.org/route/v1/driving/")
    expect(url).toContain("overview=full")
    expect(url).toContain("geometries=geojson")
  })

  it("prefers the ORS tier when the free API key is present", async () => {
    vi.stubEnv("NEXT_PUBLIC_ORS_API_KEY", "test-key")
    const stops = chain()
    const road: LngLat[] = [[144.96, -37.82], [145.0, -37.88]]
    const fetchMock = vi.fn().mockResolvedValue(orsResponse(road))
    vi.stubGlobal("fetch", fetchMock)

    await expect(fetchRoadShape(stops)).resolves.toEqual(road)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "test-key" })
      })
    )
  })

  it("resolves null on failure without caching, so a later board change retries", async () => {
    const stops = chain()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce(osrmResponse([[144.96, -37.82], [145.0, -37.88]]))
    vi.stubGlobal("fetch", fetchMock)

    await expect(fetchRoadShape(stops)).resolves.toBeNull()
    await expect(fetchRoadShape(stops)).resolves.not.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("never fetches for degenerate chains (fewer than two distinct stops)", async () => {
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
