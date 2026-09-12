import { describe, it, expect } from "vitest"
import { localDayKey, localHourLabel, endOfLocalDayUtc } from "./local-day"
import { utcDayKey, fmtHour } from "./shift-format"

describe("localDayKey", () => {
  it("returns YYYY-MM-DD for the given date in the given IANA timezone", () => {
    // 2026-01-15T23:30:00Z is still 2026-01-15 in UTC, but 2026-01-16 in UTC+1
    const d = new Date("2026-01-15T23:30:00Z")
    expect(localDayKey(d, "UTC")).toBe("2026-01-15")
    expect(localDayKey(d, "Europe/Paris")).toBe("2026-01-16")
  })

  it("returns the earlier day for a negative offset near midnight UTC", () => {
    const d = new Date("2026-01-15T01:00:00Z")
    expect(localDayKey(d, "America/Los_Angeles")).toBe("2026-01-14")
  })
})

describe("localHourLabel", () => {
  it("formats a time as h:mmAM/PM in the given timezone, omitting :00", () => {
    const d = new Date("2026-01-15T22:00:00Z") // 22:00 UTC
    expect(localHourLabel(d, "UTC")).toBe("10PM")
    expect(localHourLabel(d, "Pacific/Auckland")).toBe("11AM") // next day, +13 in Jan (DST)
  })

  it("includes minutes when non-zero", () => {
    const d = new Date("2026-01-15T22:30:00Z")
    expect(localHourLabel(d, "UTC")).toBe("10:30PM")
  })

  it("matches the UTC helpers exactly, so first paint can't mismatch hydration", () => {
    for (const iso of [
      "2026-01-15T00:00:00Z",
      "2026-01-15T00:30:00Z",
      "2026-01-15T12:00:00Z",
      "2026-01-15T22:00:00Z",
      "2026-01-15T23:59:00Z",
      "2026-07-04T09:05:00Z",
    ]) {
      const d = new Date(iso)
      expect(localDayKey(d, "UTC")).toBe(utcDayKey(d))
      expect(localHourLabel(d, "UTC")).toBe(fmtHour(d))
    }
  })
})

describe("endOfLocalDayUtc", () => {
  it("returns 23:59:59.999 UTC unchanged when the timezone is UTC", () => {
    expect(endOfLocalDayUtc("2026-09-30", "UTC").toISOString()).toBe("2026-09-30T23:59:59.999Z")
  })

  it("pushes the instant into the next UTC day for a negative offset (EDT, UTC-4 in September)", () => {
    // Local 23:59:59.999 in New York (UTC-4 in September) is 03:59:59.999 UTC the next day.
    expect(endOfLocalDayUtc("2026-09-30", "America/New_York").toISOString()).toBe("2026-10-01T03:59:59.999Z")
  })

  it("pulls the instant earlier in the same UTC day for a positive offset (JST, UTC+9)", () => {
    expect(endOfLocalDayUtc("2026-09-30", "Asia/Tokyo").toISOString()).toBe("2026-09-30T14:59:59.999Z")
  })
})
