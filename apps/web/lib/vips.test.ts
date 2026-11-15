import { describe, it, expect } from "vitest"
import {
  endOfDayIso,
  grantSchema,
  isoToDay,
  perkCreateSchema,
  postCreateSchema,
  settingsSchema,
  tierCreateSchema,
  tierUpdateSchema,
  vipTimeLeft,
  vipUpdateSchema,
} from "./vips"

const now = new Date("2026-11-15T12:00:00Z")
const vip = (over: Partial<Parameters<typeof vipTimeLeft>[0]>) => ({ ended_at: null, expires_at: null, is_active: true, ...over })

describe("vipTimeLeft", () => {
  it("says lifetime when there is no expiry", () => {
    expect(vipTimeLeft(vip({}), now)).toBe("Lifetime")
  })

  it("counts whole days remaining, rounding up", () => {
    expect(vipTimeLeft(vip({ expires_at: "2026-11-16T11:00:00Z" }), now)).toBe("Expires in 1 day")
    expect(vipTimeLeft(vip({ expires_at: "2026-11-18T12:00:01Z" }), now)).toBe("Expires in 4 days")
  })

  it("says expired once the time has passed, and ended before anything else", () => {
    expect(vipTimeLeft(vip({ expires_at: "2026-11-15T12:00:00Z" }), now)).toBe("Expired")
    expect(vipTimeLeft(vip({ expires_at: "2027-01-01T00:00:00Z", ended_at: "2026-11-01T00:00:00Z" }), now)).toBe("Ended")
  })
})

describe("expiry dates", () => {
  it("turns a day into an ISO instant and back, and refuses a bad day", () => {
    const iso = endOfDayIso("2026-12-24")
    expect(iso).not.toBeNull()
    expect(isoToDay(iso)).toBe("2026-12-24")
    expect(endOfDayIso("24/12/2026")).toBeNull()
    expect(endOfDayIso("")).toBeNull()
  })

  it("shows nothing for no expiry", () => {
    expect(isoToDay(null)).toBe("")
  })
})

describe("tier schemas", () => {
  it("needs a name and keeps cost and colour in range", () => {
    expect(tierCreateSchema.safeParse({ name: "Gold" }).success).toBe(true)
    expect(tierCreateSchema.safeParse({ name: " " }).success).toBe(false)
    expect(tierCreateSchema.safeParse({ name: "Gold", cost: -1 }).success).toBe(false)
    expect(tierCreateSchema.safeParse({ name: "Gold", color: 0x1000000 }).success).toBe(false)
    expect(tierCreateSchema.safeParse({ name: "Gold", discordRoleId: "role" }).success).toBe(false)
  })

  it("clears a description with a blank and needs something to update", () => {
    expect(tierUpdateSchema.parse({ description: "  " })).toEqual({ description: null })
    expect(tierUpdateSchema.safeParse({}).success).toBe(false)
  })
})

describe("perk and grant schemas", () => {
  it("accepts only the four repeat rules", () => {
    expect(perkCreateSchema.safeParse({ name: "Free drink", repeatability: "weekly" }).success).toBe(true)
    expect(perkCreateSchema.safeParse({ name: "Free drink", repeatability: "daily" }).success).toBe(false)
  })

  it("grants to a Discord user with a tier and an optional expiry", () => {
    const ok = { discordUserId: "1509616350337962099", displayName: "Lily", tierId: 2 }
    expect(grantSchema.safeParse(ok).success).toBe(true)
    expect(grantSchema.safeParse({ ...ok, expiresAt: "2026-12-24T23:59:59.000Z" }).success).toBe(true)
    expect(grantSchema.safeParse({ ...ok, expiresAt: "tomorrow" }).success).toBe(false)
    expect(grantSchema.safeParse({ ...ok, tierId: 0 }).success).toBe(false)
    expect(grantSchema.safeParse({ ...ok, displayName: "" }).success).toBe(false)
  })

  it("makes a VIP lifetime by clearing the expiry with null", () => {
    expect(vipUpdateSchema.parse({ expiresAt: null })).toEqual({ expiresAt: null })
    expect(vipUpdateSchema.safeParse({}).success).toBe(false)
  })
})

describe("settings and post schemas", () => {
  it("keeps the warning to 1 to 10 days, or off with null", () => {
    expect(settingsSchema.safeParse({ warningDays: 0 }).success).toBe(false)
    expect(settingsSchema.safeParse({ warningDays: 11 }).success).toBe(false)
    expect(settingsSchema.safeParse({ warningDays: 3 }).success).toBe(true)
    expect(settingsSchema.safeParse({ warningDays: null }).success).toBe(true)
  })

  it("posts only the roster or the perks catalogue", () => {
    expect(postCreateSchema.safeParse({ kind: "roster", channelId: "1509616350337962099" }).success).toBe(true)
    expect(postCreateSchema.safeParse({ kind: "welcome", channelId: "1509616350337962099" }).success).toBe(false)
  })
})
