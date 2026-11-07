import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const GUILD = "1509616350337962024"
const BOT = "1509616350337969999"

const role = (over: Record<string, unknown> = {}) => ({
  id: "100",
  name: "Bartender",
  color: 0,
  permissions: "0",
  managed: false,
  position: 3,
  ...over,
})

const load = async () => {
  vi.resetModules()
  vi.stubEnv("DISCORD_BOT_TOKEN", "bot-token")
  return import("./discord-rest")
}

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("unsafeRoleReason", () => {
  it("allows an ordinary role when the bot's position is unknown", async () => {
    const { unsafeRoleReason } = await load()
    expect(unsafeRoleReason(role(), GUILD)).toBeNull()
    expect(unsafeRoleReason(role(), GUILD, null)).toBeNull()
  })

  it("allows a role strictly below the bot's highest role", async () => {
    const { unsafeRoleReason } = await load()
    expect(unsafeRoleReason(role({ position: 4 }), GUILD, 5)).toBeNull()
  })

  it("refuses a role level with, or above, the bot's highest role", async () => {
    const { unsafeRoleReason, ROLE_ABOVE_BOT_REASON } = await load()
    expect(unsafeRoleReason(role({ position: 5 }), GUILD, 5)).toBe(ROLE_ABOVE_BOT_REASON)
    expect(unsafeRoleReason(role({ position: 9 }), GUILD, 5)).toBe(ROLE_ABOVE_BOT_REASON)
  })

  it("refuses every role for a bot that holds no role of its own", async () => {
    const { unsafeRoleReason, ROLE_ABOVE_BOT_REASON } = await load()
    expect(unsafeRoleReason(role({ position: 1 }), GUILD, 0)).toBe(ROLE_ABOVE_BOT_REASON)
  })

  it("ignores the bot's position for a role with no position, as in a list cached before positions were kept", async () => {
    const { unsafeRoleReason } = await load()
    expect(unsafeRoleReason(role({ position: undefined }), GUILD, 5)).toBeNull()
  })

  it("keeps the earlier reasons ahead of the position, so each role names its most serious problem", async () => {
    const { unsafeRoleReason } = await load()
    expect(unsafeRoleReason(role({ permissions: "8", position: 9 }), GUILD, 5)).toBe("it has Administrator permission")
    expect(unsafeRoleReason(role({ managed: true, position: 9 }), GUILD, 5)).toBe(
      "it's managed by a bot or integration"
    )
    expect(unsafeRoleReason(role({ id: GUILD, position: 0 }), GUILD, 5)).toBe("it's the @everyone role")
  })
})

describe("getGuildRoles", () => {
  it("keeps each role's position, highest first", async () => {
    const { getGuildRoles } = await load()
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(reply([role({ id: "1", position: 1 }), role({ id: "2", position: 7 })]))
    )
    const result = await getGuildRoles(GUILD)
    expect(result.ok && result.data.map((r) => [r.id, r.position])).toEqual([
      ["2", 7],
      ["1", 1],
    ])
  })
})

describe("getBotRolePosition", () => {
  const roles = [
    role({ id: GUILD, name: "@everyone", position: 0 }),
    role({ id: "10", position: 2 }),
    role({ id: "20", position: 6 }),
    role({ id: "30", position: 9 }),
  ]
  const discord = (member: Response | Error = reply({ roles: ["10", "20"] }), me: Response = reply({ id: BOT })) =>
    vi.fn(async (url: string) => {
      if (url.endsWith("/users/@me")) return me
      if (member instanceof Error) throw member
      return member.clone()
    })

  it("is the highest position among the roles the bot holds", async () => {
    const { getBotRolePosition } = await load()
    const fetchMock = discord()
    vi.stubGlobal("fetch", fetchMock)
    expect(await getBotRolePosition(GUILD, roles)).toBe(6)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/guilds/${GUILD}/members/${BOT}`),
      expect.anything()
    )
  })

  it("is 0 for a bot with only the implicit @everyone role", async () => {
    const { getBotRolePosition } = await load()
    vi.stubGlobal("fetch", discord(reply({ roles: [] })))
    expect(await getBotRolePosition(GUILD, roles)).toBe(0)
  })

  it("asks Discord for the bot's own id once, not for every guild", async () => {
    const { getBotRolePosition } = await load()
    const fetchMock = discord()
    vi.stubGlobal("fetch", fetchMock)
    await getBotRolePosition(GUILD, roles)
    await getBotRolePosition("1509616350337960000", roles)
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/users/@me"))).toHaveLength(1)
  })

  it("is null when the bot is not a member of the guild", async () => {
    const { getBotRolePosition } = await load()
    vi.stubGlobal("fetch", discord(reply({ message: "Unknown Member" }, 404)))
    expect(await getBotRolePosition(GUILD, roles)).toBeNull()
  })

  it("is null when the request throws", async () => {
    const { getBotRolePosition } = await load()
    vi.stubGlobal("fetch", discord(new Error("network down")))
    expect(await getBotRolePosition(GUILD, roles)).toBeNull()
  })

  it("is null when the roles carry no positions, rather than guessing from a stale list", async () => {
    const { getBotRolePosition } = await load()
    const fetchMock = discord()
    vi.stubGlobal("fetch", fetchMock)
    expect(await getBotRolePosition(GUILD, roles.map((r) => ({ ...r, position: undefined })) as never)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does not remember a failed lookup of the bot's id, so the next call tries again", async () => {
    const { getBotRolePosition } = await load()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply({ message: "oops" }, 500))
      .mockResolvedValueOnce(reply({ id: BOT }))
      .mockResolvedValueOnce(reply({ roles: ["20"] }))
    vi.stubGlobal("fetch", fetchMock)
    expect(await getBotRolePosition(GUILD, roles)).toBeNull()
    expect(await getBotRolePosition(GUILD, roles)).toBe(6)
  })
})
