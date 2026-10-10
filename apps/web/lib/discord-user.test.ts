import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"
import { encode } from "next-auth/jwt"
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie"
import { listManageableGuilds, administersGuild, discordGrantFrom, type DiscordGrant } from "./discord-user"

const fetchMock = vi.fn()
vi.stubGlobal("fetch", fetchMock)

const live: DiscordGrant = {
  accessToken: "tok",
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  scope: "identify email guilds",
}

const guild = (over: Record<string, unknown>) => ({
  id: "1",
  name: "A",
  icon: null,
  owner: false,
  permissions: "0",
  ...over,
})

beforeEach(() => {
  fetchMock.mockReset()
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("listManageableGuilds", () => {
  it("asks to sign in again when there is no grant", async () => {
    expect(await listManageableGuilds(null)).toEqual({ ok: false, failure: "reauth_required" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("asks to sign in again when the grant predates the guilds scope", async () => {
    const result = await listManageableGuilds({ ...live, scope: "identify email" })
    expect(result).toEqual({ ok: false, failure: "reauth_required" })
  })

  it("asks to sign in again when the grant has expired", async () => {
    const result = await listManageableGuilds({ ...live, expiresAt: 1 })
    expect(result).toEqual({ ok: false, failure: "reauth_required" })
  })

  it("sends the grant's own token and keeps only guilds the caller owns or manages", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        guild({ id: "1", name: "Owned", owner: true }),
        guild({ id: "2", name: "Managed", permissions: "32" }),
        guild({ id: "3", name: "Member only", permissions: "0" }),
      ],
    })
    const result = await listManageableGuilds(live)
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok")
    expect(result).toEqual({
      ok: true,
      guilds: [
        { id: "2", name: "Managed", iconUrl: null },
        { id: "1", name: "Owned", iconUrl: null },
      ],
    })
  })

  it("treats a 401 from Discord as a sign-in prompt, not an outage", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 })
    expect(await listManageableGuilds(live)).toEqual({ ok: false, failure: "reauth_required" })
  })

  it("reports Discord being down as unavailable", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 })
    expect(await listManageableGuilds(live)).toEqual({ ok: false, failure: "discord_unavailable" })
  })
})

describe("discordGrantFrom", () => {
  const secret = "test-secret"

  it("reads the grant back out of a real encoded session cookie", async () => {
    // A mocked getToken would pass whatever the cookie is called. This round-trips next-auth's
    // own encode so a wrong cookie name or secret fails here instead of in production.
    vi.stubEnv("NEXTAUTH_SECRET", secret)
    const jwt = await encode({ token: { id: "1", discord: live }, secret })
    const request = new NextRequest("https://x.test/api", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${jwt}` },
    })
    expect(await discordGrantFrom(request)).toEqual(live)
  })

  it("is null when the cookie has the wrong name", async () => {
    vi.stubEnv("NEXTAUTH_SECRET", secret)
    const jwt = await encode({ token: { id: "1", discord: live }, secret })
    const request = new NextRequest("https://x.test/api", { headers: { cookie: `other=${jwt}` } })
    expect(await discordGrantFrom(request)).toBeNull()
  })

  it("is null for a session that predates the grant being stored on it", async () => {
    vi.stubEnv("NEXTAUTH_SECRET", secret)
    const jwt = await encode({ token: { id: "1" }, secret })
    const request = new NextRequest("https://x.test/api", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${jwt}` },
    })
    expect(await discordGrantFrom(request)).toBeNull()
  })
})

describe("administersGuild", () => {
  it("is true only for a guild in the caller's manageable list", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [guild({ id: "2", name: "Managed", permissions: "32" })],
    })
    expect(await administersGuild(live, "2")).toEqual({ ok: true, administers: true })
    expect(await administersGuild(live, "9")).toEqual({ ok: true, administers: false })
  })
})
