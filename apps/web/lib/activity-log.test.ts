import { describe, it, expect } from "vitest"
import {
  ACTIVITY_MODULES,
  ACTIVITY_MODULE_LABELS,
  ACTIVITY_PAGE_SIZE,
  appendOlder,
  dayEndIso,
  dayStartIso,
  hasMoreActivity,
  isApplicableDay,
  oldestCreatedAt,
} from "./activity-log"

const row = (id: number, created_at: string) => ({ id, created_at })

describe("activity modules", () => {
  it("lists exactly the modules xvm-api has, each with a label", () => {
    expect([...ACTIVITY_MODULES].sort()).toEqual(
      ["events", "finance", "forms", "inventory", "memberships", "profiles", "quoteboard", "rooms", "shifts"].sort()
    )
    for (const name of ACTIVITY_MODULES) expect(ACTIVITY_MODULE_LABELS[name]).toBeTruthy()
  })
})

describe("day boundaries", () => {
  it("starts a day at local midnight and ends it at the last millisecond", () => {
    expect(new Date(dayStartIso("2026-11-14")).getTime()).toBe(new Date(2026, 10, 14, 0, 0, 0, 0).getTime())
    expect(new Date(dayEndIso("2026-11-14")).getTime()).toBe(new Date(2026, 10, 14, 23, 59, 59, 999).getTime())
  })
})

describe("paging", () => {
  it("takes the oldest created_at as the cursor", () => {
    expect(oldestCreatedAt([row(3, "2026-11-14T10:00:00Z"), row(2, "2026-11-14T09:00:00Z")])).toBe("2026-11-14T09:00:00Z")
    expect(oldestCreatedAt([])).toBeNull()
  })

  it("has more only when a page came back full", () => {
    expect(hasMoreActivity(ACTIVITY_PAGE_SIZE)).toBe(true)
    expect(hasMoreActivity(ACTIVITY_PAGE_SIZE - 1)).toBe(false)
  })

  it("appends an older page without repeating the boundary row", () => {
    const shown = [row(5, "2026-11-14T10:00:00Z"), row(4, "2026-11-14T09:00:00Z")]
    const older = [row(4, "2026-11-14T09:00:00Z"), row(3, "2026-11-14T08:00:00Z")]
    expect(appendOlder(shown, older).map((r) => r.id)).toEqual([5, 4, 3])
  })
})

describe("applicable days", () => {
  it("accepts empty and real dates in range", () => {
    expect(isApplicableDay("")).toBe(true)
    expect(isApplicableDay("2026-11-14")).toBe(true)
    expect(isApplicableDay("2024-02-29")).toBe(true)
  })

  it("rejects half-typed years, long years and impossible dates", () => {
    expect(isApplicableDay("0002-11-14")).toBe(false)
    expect(isApplicableDay("12345-01-01")).toBe(false)
    expect(isApplicableDay("2026-02-31")).toBe(false)
    expect(isApplicableDay("1999-12-31")).toBe(false)
    expect(isApplicableDay("2101-01-01")).toBe(false)
  })
})
