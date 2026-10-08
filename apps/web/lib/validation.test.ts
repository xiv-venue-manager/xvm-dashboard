import { describe, it, expect } from "vitest"
import { validators } from "./validation"

describe("validators.feedbackStatus", () => {
  it("accepts each real FeedbackStatus enum value", () => {
    for (const status of ["NEW", "UNDER_REVIEW", "PLANNED", "IN_PROGRESS", "COMPLETED", "WONT_FIX"]) {
      expect(validators.feedbackStatus.safeParse(status).success).toBe(true)
    }
  })

  it("rejects a value not in the enum", () => {
    expect(validators.feedbackStatus.safeParse("ARCHIVED").success).toBe(false)
  })
})

describe("validators.feedbackDescription", () => {
  it("accepts up to the 4000 characters xvm-api stores", () => {
    expect(validators.feedbackDescription.safeParse("x".repeat(4000)).success).toBe(true)
  })

  it("rejects more than 4000 characters and fewer than 10", () => {
    expect(validators.feedbackDescription.safeParse("x".repeat(4001)).success).toBe(false)
    expect(validators.feedbackDescription.safeParse("short").success).toBe(false)
  })
})

describe("validators.feedbackCategory", () => {
  it("accepts each real FeedbackCategory enum value", () => {
    for (const category of ["BUG_REPORT", "FEATURE_REQUEST", "IMPROVEMENT", "GENERAL"]) {
      expect(validators.feedbackCategory.safeParse(category).success).toBe(true)
    }
  })

  it("rejects a value not in the enum", () => {
    expect(validators.feedbackCategory.safeParse("OTHER").success).toBe(false)
  })
})

describe("validators.adminNotes", () => {
  it("accepts a reasonable-length string", () => {
    expect(validators.adminNotes.safeParse("Looks good, ship it.").success).toBe(true)
  })

  it("accepts undefined (optional field)", () => {
    expect(validators.adminNotes.safeParse(undefined).success).toBe(true)
  })

  it("rejects a string over 2000 characters", () => {
    expect(validators.adminNotes.safeParse("a".repeat(2001)).success).toBe(false)
  })
})

describe("validators.characterName", () => {
  it("accepts a normal FFXIV character name", () => {
    expect(validators.characterName.safeParse("Y'shtola Rhul").success).toBe(true)
  })

  it("rejects an empty string", () => {
    expect(validators.characterName.safeParse("").success).toBe(false)
  })

  it("rejects a string over 40 characters", () => {
    expect(validators.characterName.safeParse("a".repeat(41)).success).toBe(false)
  })

  it("rejects a whitespace-only string", () => {
    expect(validators.characterName.safeParse("   ").success).toBe(false)
  })

  it("trims surrounding whitespace", () => {
    const result = validators.characterName.safeParse("  Y'shtola Rhul  ")
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toBe("Y'shtola Rhul")
  })
})

describe("validators.world", () => {
  it("accepts a normal FFXIV world name", () => {
    expect(validators.world.safeParse("Balmung").success).toBe(true)
  })

  it("rejects an empty string", () => {
    expect(validators.world.safeParse("").success).toBe(false)
  })

  it("rejects a string over 32 characters", () => {
    expect(validators.world.safeParse("a".repeat(33)).success).toBe(false)
  })

  it("rejects a whitespace-only string", () => {
    expect(validators.world.safeParse("   ").success).toBe(false)
  })
})
