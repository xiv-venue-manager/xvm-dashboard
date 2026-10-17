import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  myVenues: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/api/venue-access", () => ({ myVenues: m.myVenues }))

import { GET, OPTIONS } from "./route"

const venue = (id: string, name: string, role: string) => ({
  id,
  name,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  role,
  dataCenter: "Aether",
  world: "Adamantoise",
})

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1", name: "Mira", image: "https://img/u1.png" } })
  m.myVenues.mockResolvedValue([
    venue("ven_2", "Zephyr Lounge", "OWNER"),
    venue("ven_1", "Amber Hall", "OWNER"),
    venue("ven_3", "Night Market", "MANAGER"),
    venue("ven_4", "Side Room", "STAFF"),
  ])
})

describe("shout crafter session", () => {
  it("returns only the venues the caller owns, sorted by name, with the xvm-api id", async () => {
    const body = await (await GET()).json()
    expect(body.user).toEqual({ id: "u1", name: "Mira", image: "https://img/u1.png" })
    expect(body.venues).toEqual([
      { id: "ven_1", slug: "amber-hall", name: "Amber Hall" },
      { id: "ven_2", slug: "zephyr-lounge", name: "Zephyr Lounge" },
    ])
  })

  it("still answers with the signed-in user and no venues when xvm-api cannot be read", async () => {
    m.myVenues.mockRejectedValue(new Error("No valid xvm-api credential"))
    const body = await (await GET()).json()
    expect(body.user.id).toBe("u1")
    expect(body.venues).toEqual([])
  })

  it("answers a signed-out visitor with a null user and looks up nothing", async () => {
    m.session.mockResolvedValue(null)
    const res = await GET()
    expect(await res.json()).toEqual({ user: null })
    expect(m.myVenues).not.toHaveBeenCalled()
  })

  it("allows the Shout Crafter origin, with credentials, on both GET and the preflight", async () => {
    const res = await GET()
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://shout.xivvenuemanager.com")
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true")
    expect((await OPTIONS()).status).toBe(204)
  })
})
