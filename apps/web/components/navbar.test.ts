import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  session: vi.fn(),
  myVenues: vi.fn(),
}))

vi.mock("next-auth", () => ({ getServerSession: m.session }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/api/venue-access", () => ({ myVenues: m.myVenues }))
vi.mock("./navbar-client", () => ({ NavbarClient: () => null }))

import { Navbar } from "./navbar"

const venue = { id: "ven_1", name: "The Gilded Lily", slug: "gilded-lily", role: "OWNER", dataCenter: "Aether", world: "Adamantoise" }

beforeEach(() => {
  vi.resetAllMocks()
  m.session.mockResolvedValue({ user: { id: "u1" } })
  m.myVenues.mockResolvedValue([venue])
})

const venuesOf = async () => ((await Navbar()) as unknown as { props: { venues: unknown[] } }).props.venues

describe("Navbar", () => {
  it("lists the caller's venues from xvm-api, with only the fields the navbar uses", async () => {
    expect(await venuesOf()).toEqual([{ id: "ven_1", name: "The Gilded Lily", slug: "gilded-lily", role: "OWNER" }])
    expect(m.myVenues).toHaveBeenCalledWith("u1")
  })

  it("renders with no venues instead of failing when xvm-api cannot be read", async () => {
    m.myVenues.mockRejectedValue(new Error("No valid xvm-api credential"))
    expect(await venuesOf()).toEqual([])
  })

  it("does not look anything up for a signed-out visitor", async () => {
    m.session.mockResolvedValue(null)
    expect(await venuesOf()).toEqual([])
    expect(m.myVenues).not.toHaveBeenCalled()
  })
})
