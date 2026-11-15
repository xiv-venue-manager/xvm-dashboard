import { describe, it, expect } from "vitest"
import {
  awardSchema,
  formatCooldown,
  ruleCreateSchema,
  ruleUpdateSchema,
  settingsBodySchema,
  sourceLabel,
  tierCreateSchema,
  tierUpdateSchema,
  withStanding,
  xpForLevel,
} from "./leveling"

describe("xpForLevel", () => {
  it("follows the quadratic curve xvm-api uses", () => {
    expect(xpForLevel(0, { curve_quadratic: 5, curve_linear: 50 })).toBe(0)
    expect(xpForLevel(1, { curve_quadratic: 5, curve_linear: 50 })).toBe(55)
    expect(xpForLevel(10, { curve_quadratic: 5, curve_linear: 50 })).toBe(1000)
  })
})

describe("formatCooldown", () => {
  it("picks the largest whole unit", () => {
    expect(formatCooldown(0)).toBe("No cooldown")
    expect(formatCooldown(45)).toBe("45 s")
    expect(formatCooldown(60)).toBe("1 min")
    expect(formatCooldown(90)).toBe("90 s")
    expect(formatCooldown(7200)).toBe("2 h")
  })
})

describe("sourceLabel", () => {
  it("names every source, including manual awards", () => {
    expect(sourceLabel("discord.voice")).toBe("Time in voice")
    expect(sourceLabel("manual")).toBe("Awarded by hand")
  })
})

describe("settingsBodySchema", () => {
  it("accepts a partial update and rejects an empty body", () => {
    expect(settingsBodySchema.safeParse({ xpName: "Stars" }).success).toBe(true)
    expect(settingsBodySchema.safeParse({}).success).toBe(false)
  })

  it("keeps the curve inside xvm-api's limits", () => {
    expect(settingsBodySchema.safeParse({ curveQuadratic: 0 }).success).toBe(false)
    expect(settingsBodySchema.safeParse({ curveQuadratic: 10001 }).success).toBe(false)
    expect(settingsBodySchema.safeParse({ curveLinear: 0 }).success).toBe(true)
    expect(settingsBodySchema.safeParse({ curveLinear: -1 }).success).toBe(false)
  })

  it("allows a null announcement channel to turn announcements off", () => {
    expect(settingsBodySchema.safeParse({ announcementChannelId: null }).success).toBe(true)
    expect(settingsBodySchema.safeParse({ announcementChannelId: "abc" }).success).toBe(false)
  })

  it("rejects a blank or 33-character XP name", () => {
    expect(settingsBodySchema.safeParse({ xpName: "  " }).success).toBe(false)
    expect(settingsBodySchema.safeParse({ xpName: "x".repeat(33) }).success).toBe(false)
  })
})

describe("rule schemas", () => {
  it("creates a rule for a known source only", () => {
    expect(ruleCreateSchema.safeParse({ sourceKey: "discord.message", xpAmount: 5 }).success).toBe(true)
    expect(ruleCreateSchema.safeParse({ sourceKey: "manual", xpAmount: 5 }).success).toBe(false)
    expect(ruleCreateSchema.safeParse({ sourceKey: "discord.message", xpAmount: 1_000_001 }).success).toBe(false)
  })

  it("needs at least one field to update", () => {
    expect(ruleUpdateSchema.safeParse({}).success).toBe(false)
    expect(ruleUpdateSchema.safeParse({ enabled: false }).success).toBe(true)
    expect(ruleUpdateSchema.safeParse({ cooldownSeconds: -1 }).success).toBe(false)
  })
})

describe("tier schemas", () => {
  it("needs a name and a level to create", () => {
    expect(tierCreateSchema.safeParse({ name: "Regular", minLevel: 5 }).success).toBe(true)
    expect(tierCreateSchema.safeParse({ name: "", minLevel: 5 }).success).toBe(false)
    expect(tierCreateSchema.safeParse({ name: "Regular" }).success).toBe(false)
  })

  it("keeps the colour inside 24 bits and the role a snowflake", () => {
    expect(tierCreateSchema.safeParse({ name: "A", minLevel: 1, color: 0x1000000 }).success).toBe(false)
    expect(tierCreateSchema.safeParse({ name: "A", minLevel: 1, color: 0xffffff, discordRoleId: "1509616350337962099" }).success).toBe(true)
    expect(tierCreateSchema.safeParse({ name: "A", minLevel: 1, discordRoleId: "role" }).success).toBe(false)
  })

  it("updates one field at a time and clears with null", () => {
    expect(tierUpdateSchema.safeParse({ icon: null }).success).toBe(true)
    expect(tierUpdateSchema.safeParse({}).success).toBe(false)
  })
})

describe("awardSchema", () => {
  const ok = { discordUserId: "1509616350337962099", displayName: "Lily", amount: 50 }

  it("needs a Discord user, a name and an amount from 1 to 1,000,000", () => {
    expect(awardSchema.safeParse(ok).success).toBe(true)
    expect(awardSchema.safeParse({ ...ok, amount: 0 }).success).toBe(false)
    expect(awardSchema.safeParse({ ...ok, amount: 1_000_001 }).success).toBe(false)
    expect(awardSchema.safeParse({ ...ok, discordUserId: "lily" }).success).toBe(false)
  })

  it("clears a blank note and caps one at 200 characters", () => {
    expect(awardSchema.parse({ ...ok, note: "  " }).note).toBeNull()
    expect(awardSchema.safeParse({ ...ok, note: "x".repeat(201) }).success).toBe(false)
  })
})

describe("withStanding", () => {
  const standing = (person_id: number, total_xp: number) =>
    ({ person_id, total_xp, name: `P${person_id}`, discord_user_id: null, level: 0, xp_into_level: 0, xp_for_next_level: 1, tier: null, updated_at: "" }) as never

  it("replaces a person's row and keeps the board highest first", () => {
    const next = withStanding([standing(1, 100), standing(2, 50)], standing(2, 200))
    expect(next.map((s: { person_id: number }) => s.person_id)).toEqual([2, 1])
  })

  it("adds someone new, breaking ties by person id", () => {
    const next = withStanding([standing(5, 10)], standing(3, 10))
    expect(next.map((s: { person_id: number }) => s.person_id)).toEqual([3, 5])
  })
})
