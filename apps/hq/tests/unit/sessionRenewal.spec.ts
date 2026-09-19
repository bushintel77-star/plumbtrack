import { afterEach, describe, expect, it, vi } from "vitest"

import { authApi, renewSessionIfDue, sessionRenewalDue } from "@/lib/api"

/**
 * Sliding session renewal (lib/api.ts): the console renews its 12h session
 * once it passes the midpoint of its life — triggered by the existing board
 * poll and the tab-visible event, never a new timer. A 401 from
 * /api/auth/renew means the session row hard-expired and the console routes
 * to /login through the session-expired window event.
 */

const NOW = 1_800_000_000
const HOUR = 3600

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  }
}

function sessionBody(expiresAt: number) {
  return {
    authenticated: true,
    userId: "u-1",
    organizationId: "org-1",
    organizationName: null,
    role: "owner",
    expiresAt,
    name: null
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("session renewal", () => {
  it("does not renew while more than half the session's life remains", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sessionBody(NOW + 8 * HOUR)))
    vi.stubGlobal("fetch", fetchMock)

    await authApi.session()
    expect(sessionRenewalDue(NOW)).toBe(false)

    await renewSessionIfDue(NOW)
    // The only call so far is the session probe itself.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("renews once the session is past the midpoint and slides the expiry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(sessionBody(NOW + 5 * HOUR)))
      .mockResolvedValueOnce(jsonResponse(sessionBody(NOW + 12 * HOUR)))
    vi.stubGlobal("fetch", fetchMock)

    await authApi.session()
    expect(sessionRenewalDue(NOW)).toBe(true)

    await renewSessionIfDue(NOW)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toContain("/api/auth/renew")
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST" })
    // The renewed expiry is recorded — not due again until its own midpoint.
    expect(sessionRenewalDue(NOW)).toBe(false)
  })

  it("shares one in-flight renewal across concurrent triggers", async () => {
    let resolveRenew: (value: unknown) => void = () => undefined
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(sessionBody(NOW + 5 * HOUR)))
      .mockImplementationOnce(() => new Promise(resolve => { resolveRenew = resolve }))
    vi.stubGlobal("fetch", fetchMock)

    await authApi.session()
    const first = renewSessionIfDue(NOW)
    const second = renewSessionIfDue(NOW)
    resolveRenew(jsonResponse(sessionBody(NOW + 12 * HOUR)))
    await Promise.all([first, second])

    const renewCalls = fetchMock.mock.calls.filter(call => String(call[0]).includes("/api/auth/renew"))
    expect(renewCalls).toHaveLength(1)
  })

  it("a 401 means hard-expired — fires the session-expired event and stops retrying", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(sessionBody(NOW + 5 * HOUR)))
      .mockResolvedValueOnce(jsonResponse({ message: "expired" }, 401))
    vi.stubGlobal("fetch", fetchMock)
    const dispatchEvent = vi.fn()
    vi.stubGlobal("window", { dispatchEvent })
    vi.stubGlobal("CustomEvent", class CustomEvent { constructor(readonly type: string) {} })

    await authApi.session()
    await renewSessionIfDue(NOW)

    expect(dispatchEvent).toHaveBeenCalledTimes(1)
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({ type: "plumbtrack:session-expired" })
    // The dead session is cleared — the next beat doesn't hammer a 401.
    expect(sessionRenewalDue(NOW)).toBe(false)
    await renewSessionIfDue(NOW)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("sign-out clears the tracked expiry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(sessionBody(NOW + 5 * HOUR)))
      .mockResolvedValueOnce({ ok: true, status: 204, json: async () => undefined, text: async () => "" })
    vi.stubGlobal("fetch", fetchMock)

    await authApi.session()
    expect(sessionRenewalDue(NOW)).toBe(true)
    await authApi.signOut()
    expect(sessionRenewalDue(NOW)).toBe(false)
  })
})
