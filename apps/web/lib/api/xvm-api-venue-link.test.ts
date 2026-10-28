import { describe, it, expect, vi, beforeEach } from "vitest"

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv("XVM_API_BASE_URL", "http://xvm.test")
  vi.stubGlobal("fetch", vi.fn())
})

const reply = (body: unknown, status: number) => new Response(JSON.stringify(body), { status })

const VENUE = {
  id: "ven_0123456789abcdef",
  name: "The Lilypad Lounge",
  slug: "lilypad-lounge",
  data_center: "Crystal",
  world: "Balmung",
  timezone: "America/New_York",
  is_active: true,
}

describe("getVenueByLink", () => {
  it("asks which venue holds the server, with the person's token", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(reply(VENUE, 200))
    const { getVenueByLink } = await import("./xvm-api")
    expect(await getVenueByLink("tok", "DiscordGuild", "1509616350337962024")).toEqual(VENUE)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe("http://xvm.test/venues/by-link/DiscordGuild/1509616350337962024")
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok" })
  })

  it("answers null for a server no venue holds", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(reply({ detail: "No venue linked to DiscordGuild with the provided id." }, 404))
    const { getVenueByLink } = await import("./xvm-api")
    expect(await getVenueByLink("tok", "DiscordGuild", "42")).toBeNull()
  })

  it("lets any other failure through", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(reply({ detail: "upstream" }, 502))
    const { getVenueByLink, XvmApiError } = await import("./xvm-api")
    await expect(getVenueByLink("tok", "DiscordGuild", "42")).rejects.toBeInstanceOf(XvmApiError)
  })
})
