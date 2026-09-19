import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Team-access client surface — asserts each function hits the right
 * endpoint with the right method and body. The guards themselves are
 * server-side; this spec pins the client contract (path shapes, encoded
 * params, 204 handling) so a refactor can't silently misroute a revoke.
 */

const fetchSpy = vi.hoisted(() => vi.fn())
vi.stubGlobal("fetch", fetchSpy)

import { authApi, team } from "@/lib/api"

function okJson(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response
}

function noContent(): Response {
  return { ok: true, status: 204, json: async () => undefined, text: async () => "" } as unknown as Response
}

function lastCall(): { url: string; init: RequestInit } {
  const call = fetchSpy.mock.calls.at(-1)
  return { url: String(call?.[0]), init: (call?.[1] ?? {}) as RequestInit }
}

beforeEach(() => {
  fetchSpy.mockReset()
})

describe("team access client", () => {
  it("setRole PATCHes the member's role", async () => {
    fetchSpy.mockResolvedValue(okJson({ userId: "u-1", role: "dispatcher" }))
    await team.setRole("u-1", "dispatcher")
    const { url, init } = lastCall()
    expect(url).toContain("/api/team/members/u-1")
    expect(init.method).toBe("PATCH")
    expect(JSON.parse(String(init.body))).toEqual({ role: "dispatcher" })
  })

  it("setSkills still PATCHes {skills} unchanged", async () => {
    fetchSpy.mockResolvedValue(okJson({ userId: "u-1", skills: ["gas"] }))
    await team.setSkills("u-1", ["gas"])
    const { init } = lastCall()
    expect(JSON.parse(String(init.body))).toEqual({ skills: ["gas"] })
  })

  it("removeMember DELETEs the membership and tolerates 204", async () => {
    fetchSpy.mockResolvedValue(noContent())
    await expect(team.removeMember("u-1")).resolves.toBeUndefined()
    const { url, init } = lastCall()
    expect(url).toContain("/api/team/members/u-1")
    expect(init.method).toBe("DELETE")
  })

  it("signOutMember POSTs the sign-out route", async () => {
    fetchSpy.mockResolvedValue(okJson({ revoked: 2 }))
    const result = await team.signOutMember("u-1")
    expect(result.revoked).toBe(2)
    const { url, init } = lastCall()
    expect(url).toContain("/api/team/members/u-1/sign-out")
    expect(init.method).toBe("POST")
  })

  it("listInvites GETs pending invites; revokeInvite POSTs the revoke route", async () => {
    fetchSpy.mockResolvedValue(okJson({ invites: [] }))
    await team.listInvites()
    expect(lastCall().url).toContain("/api/team/invites")

    fetchSpy.mockResolvedValue(noContent())
    await team.revokeInvite("inv-1")
    const { url, init } = lastCall()
    expect(url).toContain("/api/team/invites/inv-1/revoke")
    expect(init.method).toBe("POST")
  })

  it("sessions GETs the caller's devices; revokeSession DELETEs one, encoded", async () => {
    fetchSpy.mockResolvedValue(okJson({ sessions: [] }))
    await authApi.sessions()
    expect(lastCall().url).toContain("/api/auth/sessions")

    fetchSpy.mockResolvedValue(noContent())
    await authApi.revokeSession("sess odd/id")
    const { url, init } = lastCall()
    expect(url).toContain("/api/auth/sessions/sess%20odd%2Fid")
    expect(init.method).toBe("DELETE")
  })
})
