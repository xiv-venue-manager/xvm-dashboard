import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  token: vi.fn(),
  listMyVenues: vi.fn(),
  venueFindUnique: vi.fn(),
  venueFindMany: vi.fn(),
  errorResponse: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({ prisma: { venue: { findUnique: m.venueFindUnique, findMany: m.venueFindMany } } }))
vi.mock("@/lib/api/xvm-api-store", () => ({ getValidXvmApiToken: m.token, xvmApiErrorResponse: m.errorResponse }))
vi.mock("@/lib/api/xvm-api", () => ({ listMyVenues: m.listMyVenues }))

import { NextResponse } from "next/server"
import {
  VenueAccessUnavailable,
  asMembership,
  atLeast,
  myVenueRoles,
  myVenues,
  requireMyVenue,
  requireMyVenueRole,
  requireVenueRole,
  resolveMyVenue,
  roleInVenue,
} from "@/lib/api/venue-access"

const connected = { xvmApiVenueId: "ven_1" }
const unconnected = { xvmApiVenueId: null }
const row = (id: string, tier: string, effective = tier, active = true) => ({
  venue: {
    id,
    name: `Venue ${id}`,
    slug: `slug-${id}`,
    data_center: "Aether",
    world: "Sargatanas",
    timezone: "Europe/London",
    is_active: active,
  },
  tier,
  effective_tier: effective,
})

beforeEach(() => {
  vi.resetAllMocks()
  m.token.mockResolvedValue("tok")
  m.listMyVenues.mockResolvedValue([row("ven_1", "manager"), row("ven_2", "staff"), row("ven_3", "something-new")])
})

describe("atLeast", () => {
  it("orders staff < manager < owner and refuses no role", () => {
    expect(atLeast("OWNER", "MANAGER")).toBe(true)
    expect(atLeast("MANAGER", "MANAGER")).toBe(true)
    expect(atLeast("STAFF", "MANAGER")).toBe(false)
    expect(atLeast(null, "STAFF")).toBe(false)
  })
})

describe("roleInVenue", () => {
  it("reads the role from xvm-api, upper-cased to the strings the app already uses", async () => {
    expect(await roleInVenue("u1", connected)).toBe("MANAGER")
  })

  it("uses the effective tier, so a live temporary grant counts", async () => {
    m.listMyVenues.mockResolvedValue([row("ven_1", "staff", "manager")])
    expect(await roleInVenue("u1", connected)).toBe("MANAGER")
  })

  it("answers null for a venue that is not in the list, which is how a member who has left looks", async () => {
    expect(await roleInVenue("u1", { xvmApiVenueId: "ven_9" })).toBeNull()
  })

  it("ignores a tier it does not know rather than guessing a role", async () => {
    expect(await roleInVenue("u1", { xvmApiVenueId: "ven_3" })).toBeNull()
  })

  it("answers null for a venue with no xvm-api venue, without asking xvm-api", async () => {
    expect(await roleInVenue("u1", unconnected)).toBeNull()
    expect(m.listMyVenues).not.toHaveBeenCalled()
  })

  it("throws, instead of answering no access, when there is no credential", async () => {
    m.token.mockResolvedValue(null)
    await expect(roleInVenue("u1", connected)).rejects.toBeInstanceOf(VenueAccessUnavailable)
  })

  it("lets an xvm-api failure propagate, instead of answering no access", async () => {
    m.listMyVenues.mockRejectedValue(new Error("boom"))
    await expect(roleInVenue("u1", connected)).rejects.toThrow("boom")
  })
})

describe("myVenueRoles", () => {
  it("maps Prisma venue ids to roles", async () => {
    m.venueFindMany.mockResolvedValue([
      { id: "p1", xvmApiVenueId: "ven_1" },
      { id: "p2", xvmApiVenueId: "ven_2" },
    ])
    const roles = await myVenueRoles("u1")
    expect([...roles]).toEqual([
      ["p1", "MANAGER"],
      ["p2", "STAFF"],
    ])
    expect(m.venueFindMany).toHaveBeenCalledWith({
      where: { xvmApiVenueId: { in: ["ven_1", "ven_2"] } },
      select: { id: true, xvmApiVenueId: true },
    })
  })
})

describe("asMembership", () => {
  it("has the fields the client pages read off /api/venues", () => {
    expect(asMembership("u1", "p1", "MANAGER")).toEqual({ userId: "u1", venueId: "p1", role: "MANAGER", status: "active" })
  })
})

describe("requireVenueRole", () => {
  beforeEach(() => m.venueFindUnique.mockResolvedValue(connected))

  it("lets an invited manager through even though Prisma has no membership row", async () => {
    const access = await requireVenueRole("u1", "p1", "MANAGER", "no")
    expect(access).toEqual({ ok: true, role: "MANAGER" })
  })

  it("refuses with the route's own message when the role is too low", async () => {
    const access = await requireVenueRole("u1", "p2", "OWNER", "Only the owner can do that")
    expect(access.ok).toBe(false)
    if (access.ok) return
    expect(access.response.status).toBe(403)
    expect(await access.response.json()).toEqual({ error: "Only the owner can do that" })
  })

  it("answers 403, not 404, for a venue that does not exist", async () => {
    m.venueFindUnique.mockResolvedValue(null)
    const access = await requireVenueRole("u1", "missing", "STAFF", "nope")
    expect(access.ok).toBe(false)
    if (!access.ok) expect(access.response.status).toBe(403)
  })

  it("answers 503, never 403, when there is no credential", async () => {
    m.token.mockResolvedValue(null)
    const access = await requireVenueRole("u1", "p1", "STAFF", "nope")
    expect(access.ok).toBe(false)
    if (!access.ok) expect(access.response.status).toBe(503)
  })

  it("hands an xvm-api failure to the shared error mapper, so an unreachable API is not a refusal", async () => {
    const failure = NextResponse.json({ error: "xvm-api unavailable" }, { status: 502 })
    m.listMyVenues.mockRejectedValue(new Error("down"))
    m.errorResponse.mockResolvedValue(failure)
    const access = await requireVenueRole("u1", "p1", "STAFF", "nope")
    expect(access).toEqual({ ok: false, response: failure })
    expect(m.errorResponse).toHaveBeenCalledWith(expect.any(Error), "u1", "[venue access] /me/venues read error")
  })
})

describe("an unrecognised tier", () => {
  it("is logged when it hides a venue, so a vanished venue can be found in the logs", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    await myVenues("u1")
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unrecognised membership tier "something-new"'))
    warn.mockRestore()
  })

  it("stays quiet for the tiers the app knows", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    m.listMyVenues.mockResolvedValue([row("ven_1", "owner"), row("ven_2", "manager"), row("ven_3", "staff")])
    await myVenues("u1")
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe("myVenues", () => {
  it("lists the caller's venues with the effective role, dropping tiers the app does not know", async () => {
    expect(await myVenues("u1")).toEqual([
      { id: "ven_1", name: "Venue ven_1", slug: "slug-ven_1", dataCenter: "Aether", world: "Sargatanas", timezone: "Europe/London", role: "MANAGER" },
      { id: "ven_2", name: "Venue ven_2", slug: "slug-ven_2", dataCenter: "Aether", world: "Sargatanas", timezone: "Europe/London", role: "STAFF" },
    ])
  })
})

describe("a deactivated venue", () => {
  beforeEach(() => {
    m.listMyVenues.mockResolvedValue([row("ven_1", "owner"), row("ven_2", "owner", "owner", false)])
  })

  it("is left out of the caller's venues", async () => {
    expect((await myVenues("u1")).map((v) => v.id)).toEqual(["ven_1"])
  })

  it("cannot be resolved by id or by slug", async () => {
    expect(await resolveMyVenue("u1", "ven_2")).toBeNull()
    expect(await resolveMyVenue("u1", "slug-ven_2")).toBeNull()
  })

  it("gives the caller no role in it", async () => {
    expect(await roleInVenue("u1", { xvmApiVenueId: "ven_2" })).toBeNull()
  })
})

describe("resolveMyVenue", () => {
  it("finds a venue by its xvm-api id or by its slug", async () => {
    expect((await resolveMyVenue("u1", "ven_2"))?.id).toBe("ven_2")
    expect((await resolveMyVenue("u1", "slug-ven_1"))?.id).toBe("ven_1")
  })

  it("answers null for a venue the caller is not a member of, so a stranger gets no access and no hint", async () => {
    expect(await resolveMyVenue("u1", "ven_9")).toBeNull()
    expect(await resolveMyVenue("u1", "slug-ven_3")).toBeNull()
  })
})

describe("requireMyVenue", () => {
  it("hands back the venue", async () => {
    const found = await requireMyVenue("u1", "slug-ven_1", "[t]")
    expect(found.ok).toBe(true)
    if (found.ok) expect(found.venue.id).toBe("ven_1")
  })

  it("answers 404 for a venue that is not the caller's", async () => {
    const found = await requireMyVenue("u1", "ven_9", "[t]")
    expect(found.ok).toBe(false)
    if (!found.ok) expect(found.response.status).toBe(404)
  })

  it("answers 503, never 404, when there is no credential", async () => {
    m.token.mockResolvedValue(null)
    const found = await requireMyVenue("u1", "ven_1", "[t]")
    expect(found.ok).toBe(false)
    if (!found.ok) expect(found.response.status).toBe(503)
  })

  it("hands an xvm-api failure to the shared error mapper under the caller's label", async () => {
    const failure = NextResponse.json({ error: "xvm-api unavailable" }, { status: 502 })
    m.listMyVenues.mockRejectedValue(new Error("down"))
    m.errorResponse.mockResolvedValue(failure)
    expect(await requireMyVenue("u1", "ven_1", "[t] read error")).toEqual({ ok: false, response: failure })
    expect(m.errorResponse).toHaveBeenCalledWith(expect.any(Error), "u1", "[t] read error")
  })
})

describe("requireMyVenueRole", () => {
  it("hands back the venue when the caller's role is high enough", async () => {
    const found = await requireMyVenueRole("u1", "ven_1", "STAFF", "no", "[t]")
    expect(found.ok).toBe(true)
    if (found.ok) expect(found.venue.id).toBe("ven_1")
  })

  it("refuses with the route's own message when the role is too low", async () => {
    const found = await requireMyVenueRole("u1", "ven_1", "OWNER", "Only the owner can do that", "[t]")
    expect(found.ok).toBe(false)
    if (found.ok) return
    expect(found.response.status).toBe(403)
    expect(await found.response.json()).toEqual({ error: "Only the owner can do that" })
  })

  it("answers 404, not 403, for a venue that is not the caller's", async () => {
    const found = await requireMyVenueRole("u1", "ven_9", "STAFF", "no", "[t]")
    expect(found.ok).toBe(false)
    if (!found.ok) expect(found.response.status).toBe(404)
  })
})
