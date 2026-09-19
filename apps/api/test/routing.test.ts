import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const { auditCreate } = vi.hoisted(() => ({
  auditCreate: vi.fn(),
}));

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    auditEvent: { create: auditCreate },
  },
}));

import { buildApp } from "../src/server";

const ORG = "org_caulfield_south";

/**
 * Zero-mock routing tests. The proxy's only upstream is OpenRouteService
 * (constant URL, credentials in the POST body), so live tests run when a
 * real ORS_API_KEY is present in the environment and skip otherwise — they
 * never fake provider responses. The only stub anywhere is the audit DB
 * write. Behaviour without a key (503 + client straight-line fallback) is
 * asserted live.
 */

const STOPS = {
  shape: "144.9613,-37.8136;145.0162,-37.8891",
  cached: "144.9075,-37.7500;144.9789,-37.8305;145.0321,-37.9201",
  matrix: "144.9500,-37.8000;144.9900,-37.8500",
} as const

const hasKey = Boolean(process.env.ORS_API_KEY?.trim())

beforeEach(() => {
  auditCreate.mockResolvedValue({})
})

describe("routing proxy (GET /api/routing/*) — no-key behaviour (live)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    delete process.env.ORS_API_KEY
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it("answers 503 with an actionable message when ORS_API_KEY is not configured", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/routing/shape?stops=${STOPS.shape}`,
      headers: { "x-organization-id": ORG },
    })
    expect(response.statusCode).toBe(503)
    expect(response.json().message).toMatch(/ORS_API_KEY/)
  })

  it("rejects malformed and undersized coordinate lists with 400, before any upstream call", async () => {
    for (const stops of ["144.96", "144.96,-37.82;banana", "144.96,-37.82;144.96,-37.82", ""]) {
      const response = await app.inject({
        method: "GET",
        url: `/api/routing/shape?stops=${encodeURIComponent(stops)}`,
        headers: { "x-organization-id": ORG },
      })
      expect(response.statusCode).toBe(400)
    }
  })

  it("requires an authenticated session in fail-closed mode", async () => {
    const previousNodeEnv = process.env.NODE_ENV
    const previousLegacy = process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER
    delete process.env.NODE_ENV
    delete process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER

    const response = await app.inject({
      method: "GET",
      url: `/api/routing/shape?stops=${STOPS.shape}`,
    })

    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
    if (previousLegacy === undefined) delete process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER
    else process.env.PLUMBTRACK_ALLOW_LEGACY_TENANT_HEADER = previousLegacy

    expect(response.statusCode).toBe(401)
  })

  it("answers 503 for isochrones, geocode and optimize without ORS_API_KEY", async () => {
    for (const [method, url] of [
      ["GET", `/api/routing/isochrones?lat=-37.8&lng=144.96&range=15`],
      ["GET", `/api/routing/geocode?text=1200%20Northgate%20Way`],
      ["POST", "/api/routing/optimize"],
    ] as const) {
      const response = await app.inject({
        method,
        url,
        headers: { "x-organization-id": ORG },
        ...(method === "POST" ? { payload: { jobs: [{ id: "j-1", location: [144.96, -37.8] }], vehicles: [{ id: "t-1", start: [144.96, -37.8] }] } } : {}),
      })
      expect(response.statusCode).toBe(503)
      expect(response.json().message).toMatch(/ORS_API_KEY/)
    }
  })

  it("validates isochrone range and optimize payloads before any upstream call", async () => {
    const badRange = await app.inject({
      method: "GET",
      url: "/api/routing/isochrones?lat=-37.8&lng=144.96&range=abc",
      headers: { "x-organization-id": ORG },
    })
    expect(badRange.statusCode).toBe(400)

    const badOptimize = await app.inject({
      method: "POST",
      url: "/api/routing/optimize",
      headers: { "x-organization-id": ORG },
      payload: { jobs: [], vehicles: [{ id: "t-1", start: [144.96, -37.8] }] },
    })
    expect(badOptimize.statusCode).toBe(400)
  })
})

describe("routing proxy — upstream-call audit (stubbed fetch)", () => {
  let app: FastifyInstance;
  const originalFetch = globalThis.fetch;
  // Unique coordinates — the in-process response caches are module-level and
  // shared with the other describes, so these points must not collide.
  const MATRIX_POINTS = "145.1000,-37.1000;145.2000,-37.2000"

  beforeAll(async () => {
    process.env.ORS_API_KEY = "test-ors-key"
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterAll(async () => {
    globalThis.fetch = originalFetch
    delete process.env.ORS_API_KEY
    await app.close()
  })

  it("audits a real upstream call on cache miss, and not the cache-hit replay", async () => {
    globalThis.fetch = (async () => new Response(
      JSON.stringify({ durations: [[0, 120], [120, 0]] }),
      { status: 200 },
    )) as typeof fetch
    auditCreate.mockClear()

    const first = await app.inject({
      method: "GET",
      url: `/api/routing/matrix?points=${MATRIX_POINTS}`,
      headers: { "x-organization-id": ORG },
    })
    expect(first.statusCode).toBe(200)
    // The spend record fires once for the actual provider call.
    expect(auditCreate).toHaveBeenCalledTimes(1)
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "routing.matrix",
        entityType: "routing",
      }),
    })

    auditCreate.mockClear()
    const second = await app.inject({
      method: "GET",
      url: `/api/routing/matrix?points=${MATRIX_POINTS}`,
      headers: { "x-organization-id": ORG },
    })
    expect(second.statusCode).toBe(200)
    expect(second.json()).toEqual(first.json())
    // A served-from-cache response costs nothing — no second audit row.
    expect(auditCreate).not.toHaveBeenCalled()
  })

  it("forwards the vehicle capacity array to the VROOM request verbatim", async () => {
    const bodies: string[] = []
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ""))
      return new Response(JSON.stringify({ code: 0, routes: [], unassigned: [] }), { status: 200 })
    }) as typeof fetch

    const response = await app.inject({
      method: "POST",
      url: "/api/routing/optimize",
      headers: { "x-organization-id": ORG },
      payload: {
        jobs: [{ id: "j-1", location: [145.31, -37.31], service: 1800 }],
        vehicles: [
          { id: "t-1", start: [145.31, -37.31], capacity: [6], time_window: [28800, 64800] },
          { id: "t-2", start: [145.31, -37.31], capacity: [4] },
        ],
      },
    })
    expect(response.statusCode).toBe(200)
    expect(bodies).toHaveLength(1)
    const upstream = JSON.parse(bodies[0]) as { vehicles: Array<{ capacity?: number[] }> }
    // The per-route task cap the schema used to strip must reach VROOM.
    expect(upstream.vehicles[0].capacity).toEqual([6])
    expect(upstream.vehicles[1].capacity).toEqual([4])
  })

  it("rejects malformed vehicle capacity before any upstream call", async () => {
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    for (const capacity of [[0], [-2], [1.5], Array(5).fill(4)]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/routing/optimize",
        headers: { "x-organization-id": ORG },
        payload: {
          jobs: [{ id: "j-1", location: [145.31, -37.31] }],
          vehicles: [{ id: "t-1", start: [145.31, -37.31], capacity }],
        },
      })
      expect(response.statusCode).toBe(400)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe("routing proxy — live ORS tier (runs only with a real ORS_API_KEY)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it(
    "returns a real road shape from ORS",
    { timeout: 20_000, skip: !hasKey },
    async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/routing/shape?stops=${STOPS.shape}`,
        headers: { "x-organization-id": ORG },
      })
      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.source).toBe("ors")
      expect(body.coordinates.length).toBeGreaterThan(2)
      const [lng, lat] = body.coordinates[0]
      expect(Math.abs(lng - 144.9613)).toBeLessThan(0.01)
      expect(Math.abs(lat - -37.8136)).toBeLessThan(0.01)
    }
  )

  it(
    "serves an identical repeat from cache — same payload, instant second call",
    { timeout: 20_000, skip: !hasKey },
    async () => {
      const url = `/api/routing/shape?stops=${STOPS.cached}`
      const first = await app.inject({ method: "GET", url, headers: { "x-organization-id": ORG } })
      expect(first.statusCode).toBe(200)

      const started = process.hrtime.bigint()
      const second = await app.inject({ method: "GET", url, headers: { "x-organization-id": ORG } })
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6
      expect(second.statusCode).toBe(200)
      expect(elapsedMs).toBeLessThan(50)
      expect(second.json()).toEqual(first.json())
    }
  )

  it(
    "returns a real duration matrix from ORS",
    { timeout: 20_000, skip: !hasKey },
    async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/routing/matrix?points=${STOPS.matrix}`,
        headers: { "x-organization-id": ORG },
      })
      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.source).toBe("ors")
      expect(body.durations[0][0]).toBe(0)
      expect(body.durations[0][1]).toBeGreaterThan(30)
    }
  )
})
