import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

vi.mock("@plumbtrack/database", () => ({
  prisma: {
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
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
