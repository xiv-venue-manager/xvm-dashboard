import { describe, it, expect, vi, beforeEach } from "vitest"
import type { MyVenue, VenueRole } from "@/lib/api/venue-access"
import type { VenueLinkRow } from "@/lib/api/xvm-api"
import { signInCallbackUrl } from "@/lib/callback-url"
import type { GuildAuthority } from "@/lib/discord-user"
import { connectServer, connectView, guildIdFrom, hasLiveServer, ownedVenues, signInUrl } from "./connect-discord"

const venue = (id: string, name: string, role: VenueRole = "OWNER"): MyVenue => ({
  id,
  name,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  dataCenter: "Crystal",
  world: "Balmung",
  timezone: "America/New_York",
  role,
})

const LILYPAD = venue("ven_a", "The Lilypad")
const POND = venue("ven_b", "The Pond")
const ELSEWHERE = venue("ven_c", "Elsewhere", "MANAGER")
const MANAGES: GuildAuthority = { ok: true, administers: true }

const view = (over: Partial<Parameters<typeof connectView>[0]> = {}) =>
  connectView({
    botIsMember: true,
    authority: MANAGES,
    current: null,
    mine: [LILYPAD, ELSEWHERE, POND],
    connectedElsewhere: new Set(),
    ...over,
  })

const link = (over: Partial<VenueLinkRow> = {}): VenueLinkRow => ({
  id: 1,
  provider: "DiscordGuild",
  external_id: "1509616350337962024",
  linked_at: "2026-10-19T15:47:45Z",
  linked_by_person_id: 1,
  last_synced_at: null,
  unlinked_at: null,
  ...over,
})

describe("guildIdFrom", () => {
  it("takes a Discord id", () => {
    expect(guildIdFrom("1509616350337962024")).toBe("1509616350337962024")
  })

  it("refuses anything that isn't one", () => {
    expect(guildIdFrom(undefined)).toBeNull()
    expect(guildIdFrom("")).toBeNull()
    expect(guildIdFrom("lilypad")).toBeNull()
    expect(guildIdFrom(["1509616350337962024", "1"])).toBeNull()
    expect(guildIdFrom("1".repeat(25))).toBeNull()
    expect(guildIdFrom("99999999999999999999")).toBeNull()
  })
})

describe("signInUrl", () => {
  it("comes back to the same page, query and all", () => {
    const back = "/connect/discord?guild=1509616350337962024&from=welcome"
    const url = new URL(signInUrl(back), "https://xvm.test")
    expect(url.pathname).toBe("/auth/signin")
    expect(signInCallbackUrl(url.search, url.origin)).toBe(back)
  })
})

describe("ownedVenues", () => {
  it("keeps the venues you own", () => {
    expect(ownedVenues([LILYPAD, ELSEWHERE, POND])).toEqual([LILYPAD, POND])
  })
})

describe("hasLiveServer", () => {
  it("sees a live Discord server link", () => {
    expect(hasLiveServer({ external_links: [link()] })).toBe(true)
  })

  it("ignores an ended link, and links to other places", () => {
    expect(hasLiveServer({ external_links: [link({ unlinked_at: "2026-10-27T00:00:00Z" })] })).toBe(false)
    expect(hasLiveServer({ external_links: [link({ provider: "FFXIVVenues" })] })).toBe(false)
    expect(hasLiveServer({ external_links: [] })).toBe(false)
  })
})

describe("connectView", () => {
  it("offers the venues you own, and only those", () => {
    expect(view()).toEqual({
      kind: "choose",
      venues: [
        { id: "ven_a", slug: "the-lilypad", name: "The Lilypad", world: "Balmung", dataCenter: "Crystal", connectedElsewhere: false },
        { id: "ven_b", slug: "the-pond", name: "The Pond", world: "Balmung", dataCenter: "Crystal", connectedElsewhere: false },
      ],
    })
  })

  it("marks a venue that has another server", () => {
    const shown = view({ connectedElsewhere: new Set(["ven_b"]) })
    expect(shown.kind === "choose" && shown.venues.map((v) => [v.id, v.connectedElsewhere])).toEqual([
      ["ven_a", false],
      ["ven_b", true],
    ])
  })

  it("offers nothing to connect when you own no venue", () => {
    expect(view({ mine: [ELSEWHERE] })).toEqual({ kind: "choose", venues: [] })
  })

  it("offers nothing at all to someone who doesn't manage the server", () => {
    expect(view({ authority: { ok: true, administers: false } })).toEqual({ kind: "not-manager" })
  })

  it("asks for a fresh sign-in when Discord can't vouch for you", () => {
    expect(view({ authority: { ok: false, failure: "reauth_required" } })).toEqual({ kind: "reauth" })
    expect(view({ authority: { ok: false, failure: "discord_unavailable" } })).toEqual({ kind: "unavailable" })
  })

  it("says the bot is missing before anything else", () => {
    expect(view({ botIsMember: false, authority: { ok: true, administers: false } })).toEqual({ kind: "bot-absent" })
  })

  it("names the venue a server belongs to when it's one of yours, manager or not", () => {
    expect(view({ current: { id: "ven_c" }, authority: { ok: true, administers: false } })).toEqual({
      kind: "connected",
      venue: { name: "Elsewhere", slug: "elsewhere" },
    })
  })

  it("keeps someone else's venue unnamed", () => {
    expect(view({ current: { id: "ven_z" } })).toEqual({ kind: "connected", venue: null })
  })

  it("says so when either read failed", () => {
    expect(view({ current: "unavailable" })).toEqual({ kind: "unavailable" })
    expect(view({ mine: "unavailable" })).toEqual({ kind: "unavailable" })
  })
})

describe("connectServer", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  it("posts the server to the venue's link route", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: 1 }), { status: 201 }))
    expect(await connectServer("the-lilypad", "1509616350337962024")).toBeNull()
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe("/api/venues/the-lilypad/discord/link")
    expect((init as RequestInit).method).toBe("POST")
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ guildId: "1509616350337962024" })
  })

  it("passes on the route's own words when it refuses", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "bot_absent", message: "Invite the bot to that server first, then connect it." }), {
        status: 409,
      })
    )
    expect(await connectServer("the-lilypad", "42")).toBe("Invite the bot to that server first, then connect it.")
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "You don't manage that Discord server." }), { status: 403 })
    )
    expect(await connectServer("the-lilypad", "42")).toBe("You don't manage that Discord server.")
  })

  it("says so when the request never arrives", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"))
    expect(await connectServer("the-lilypad", "42")).toMatch(/Network error/)
  })
})
