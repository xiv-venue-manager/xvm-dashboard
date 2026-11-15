import { describe, it, expect } from "vitest"
import {
  chosen,
  clanChoices,
  imageUpdateSchema,
  pronounKeys,
  pronounLabel,
  pronounsToString,
  profileUpdateSchema,
  rejectSchema,
  RACES,
} from "./profiles"

describe("clanChoices", () => {
  it("offers a race's two clans, then Custom and NA", () => {
    expect(Object.keys(clanChoices("miqote"))).toEqual(["keeper_of_the_moon", "seeker_of_the_sun", "custom", "na"])
  })

  it("offers only Custom and NA for a race with no list, or no race", () => {
    expect(Object.keys(clanChoices("custom"))).toEqual(["custom", "na"])
    expect(Object.keys(clanChoices(null))).toEqual(["custom", "na"])
    expect(Object.keys(clanChoices("fantasia_addict"))).toEqual(["custom", "na"])
  })
})

describe("chosen", () => {
  it("shows a known value by its label", () => {
    expect(chosen(RACES, "miqote", null)).toBe("Miqo'te")
  })

  it("shows Custom as its own text, and an unknown value as stored", () => {
    expect(chosen(RACES, "custom", "Void-touched")).toBe("Void-touched")
    expect(chosen(RACES, "mystery", null)).toBe("mystery")
  })

  it("is null for nothing", () => {
    expect(chosen(RACES, null, null)).toBeNull()
    expect(chosen(RACES, "", null)).toBeNull()
  })
})

describe("pronouns", () => {
  it("stores the picks in the list's order whatever order they were made in", () => {
    expect(pronounsToString(["they", "she", "her"])).toBe("she,her,they")
  })

  it("stores nothing as null and ignores keys the list does not know", () => {
    expect(pronounsToString([])).toBeNull()
    expect(pronounsToString(["nope"])).toBeNull()
  })

  it("reads the stored string back and labels it", () => {
    expect(pronounKeys("she,her")).toEqual(["she", "her"])
    expect(pronounKeys(null)).toEqual([])
    expect(pronounLabel("she,her")).toBe("She/Her")
    expect(pronounLabel(null)).toBeNull()
  })
})

describe("profileUpdateSchema", () => {
  it("turns blank text into null so it clears the field", () => {
    expect(profileUpdateSchema.parse({ rates: "  ", color: null })).toEqual({ rates: null, color: null })
  })

  it("keeps the bot's length limits", () => {
    expect(profileUpdateSchema.safeParse({ aboutMe: "x".repeat(3001) }).success).toBe(false)
    expect(profileUpdateSchema.safeParse({ jobs: "x".repeat(81) }).success).toBe(false)
    expect(profileUpdateSchema.safeParse({ personality: "x".repeat(301) }).success).toBe(false)
    expect(profileUpdateSchema.safeParse({ characterName: "x".repeat(61) }).success).toBe(false)
    expect(profileUpdateSchema.safeParse({ characterName: " " }).success).toBe(false)
  })

  it("needs something to save", () => {
    expect(profileUpdateSchema.safeParse({}).success).toBe(false)
  })
})

describe("reject and image schemas", () => {
  it("needs a reason of at most 500 characters", () => {
    expect(rejectSchema.safeParse({ reason: "" }).success).toBe(false)
    expect(rejectSchema.safeParse({ reason: "x".repeat(501) }).success).toBe(false)
    expect(rejectSchema.safeParse({ reason: "Needs a picture" }).success).toBe(true)
  })

  it("clears a caption with a blank and keeps a zero sort order", () => {
    expect(imageUpdateSchema.parse({ caption: "" })).toEqual({ caption: null })
    expect(imageUpdateSchema.parse({ sortOrder: 0 })).toEqual({ sortOrder: 0 })
    expect(imageUpdateSchema.safeParse({ caption: "x".repeat(51) }).success).toBe(false)
  })
})
