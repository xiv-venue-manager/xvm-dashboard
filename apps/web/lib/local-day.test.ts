import { describe, it, expect } from "vitest"
import { localDayKey, localHourLabel } from "./local-day"
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

describe("calendar grid day keys", () => {
  it("utcDayKey keeps a UTC-midnight grid cell on its own date where localDayKey slips a day", () => {
    const cell = new Date(Date.UTC(2026, 9, 25))
    expect(utcDayKey(cell)).toBe("2026-10-25")
    expect(localDayKey(cell, "America/Los_Angeles")).toBe("2026-10-24")
  })
})
