import { describe, it, expect, afterEach, vi } from "vitest"
import { utcWeeklyToLocal, localDayOf, formatLocalEntryTime, xvmHoursToScheduleEntries, type ScheduleEntry } from "./schedule-utils"
import type { HoursRow, RuleRow } from "@/lib/api/xvm-api"

const originalTZ = process.env.TZ

afterEach(() => {
  process.env.TZ = originalTZ
})

describe("utcWeeklyToLocal", () => {
  it("keeps the same weekday/time when local offset is UTC+0", () => {
    process.env.TZ = "Etc/UTC"
    expect(utcWeeklyToLocal(2, 14, 30)).toEqual({ day: 2, hour: 14, minute: 30 })
  })

  it("shifts to the next local weekday when a late UTC time crosses local midnight", () => {
    // Saturday 23:30 UTC, Europe/London is UTC+1 in August (BST) -> Sunday 00:30 local
    process.env.TZ = "Europe/London"
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 12, 12, 0, 0)))
    try {
      expect(utcWeeklyToLocal(6, 23, 30)).toEqual({ day: 0, hour: 0, minute: 30 })
    } finally {
      vi.useRealTimers()
    }
  })

  it("shifts to the previous local weekday when a negative offset crosses local midnight backwards", () => {
    // Sunday 00:15 UTC, Pacific/Honolulu is UTC-10 -> Saturday 14:15 local
    process.env.TZ = "Pacific/Honolulu"
    expect(utcWeeklyToLocal(0, 0, 15)).toEqual({ day: 6, hour: 14, minute: 15 })
  })

  it("anchors to the nearest occurrence across a DST transition, not the raw signed offset", () => {
    process.env.TZ = "Europe/London"
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.UTC(2026, 3, 2, 12, 0, 0)))
    try {
      expect(utcWeeklyToLocal(0, 0, 30)).toEqual({ day: 0, hour: 1, minute: 30 })
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("localDayOf", () => {
  it("returns the local weekday an entry's start time falls on", () => {
    process.env.TZ = "Europe/London"
    const entry: ScheduleEntry = {
      id: "1",
      venueId: "v1",
      day: 6,
      startHour: 23,
      startMin: 30,
      endHour: null,
      endMin: null,
      crossesMidnight: false,
      interval: "WEEKLY",
      weekOfMonth: null,
      commencing: null,
      label: null,
    }
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 12, 12, 0, 0)))
    try {
      expect(localDayOf(entry)).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("formatLocalEntryTime", () => {
  it("formats a same-day entry with no ST suffix", () => {
    process.env.TZ = "Etc/UTC"
    const entry: ScheduleEntry = {
      id: "1",
      venueId: "v1",
      day: 2,
      startHour: 20,
      startMin: 0,
      endHour: 22,
      endMin: 30,
      crossesMidnight: false,
      interval: "WEEKLY",
      weekOfMonth: null,
      commencing: null,
      label: null,
    }
    expect(formatLocalEntryTime(entry)).toBe("8 PM – 10:30 PM")
  })

  describe("a crossesMidnight entry resolves the end time's local weekday separately", () => {
    const entry: ScheduleEntry = {
      id: "1",
      venueId: "v1",
      day: 6,
      startHour: 23,
      startMin: 0,
      endHour: 1,
      endMin: 0,
      crossesMidnight: true,
      interval: "WEEKLY",
      weekOfMonth: null,
      commencing: null,
      label: null,
    }

    function formatAt(now: Date): string {
      process.env.TZ = "Europe/London"
      vi.useFakeTimers()
      vi.setSystemTime(now)
      try {
        return formatLocalEntryTime(entry)
      } finally {
        vi.useRealTimers()
      }
    }

    it("keeps the end on the same local day while Britain is on BST", () => {
      // Saturday 23:00 -> Sunday 01:00 UTC. In Europe/London (BST, +1) both shift
      // to Sunday 00:00 -> Sunday 02:00 local, so the end stays same-day.
      expect(formatAt(new Date(Date.UTC(2026, 9, 14, 12, 0, 0)))).toBe("12 AM – 2 AM")
    })

    it("is off by the DST delta when the end falls on the clock change (accepted ceiling)", () => {
      expect(formatAt(new Date(Date.UTC(2026, 9, 22, 12, 0, 0)))).toBe("12 AM – 1 AM")
    })
  })
})

describe("xvmHoursToScheduleEntries", () => {
  function row(rule: Partial<RuleRow>): HoursRow {
    return {
      id: 1,
      label: null,
      source: "manual",
      rule: {
        interval: "weekly",
        weekday: 0,
        day_of_month: null,
        week_of_month: null,
        start_minute_of_day: 0,
        duration_minutes: 60,
        timezone: "UTC",
        anchor_date: "2026-01-01",
        ends_on: null,
        ends_after_count: null,
        enabled: true,
        ...rule,
      },
    }
  }

  it("converts weekday: xvm-api Monday(0) to ScheduleEntry Sunday-indexed day(1)", () => {
    const [entry] = xvmHoursToScheduleEntries([row({ weekday: 0 })])
    expect(entry.day).toBe(1)
  })

  it("converts weekday: xvm-api Sunday(6) to ScheduleEntry day(0)", () => {
    const [entry] = xvmHoursToScheduleEntries([row({ weekday: 6 })])
    expect(entry.day).toBe(0)
  })

  it("derives crossing-midnight start/end from start_minute_of_day + duration_minutes", () => {
    const [entry] = xvmHoursToScheduleEntries([row({ start_minute_of_day: 1380, duration_minutes: 120 })])
    expect(entry.startHour).toBe(23)
    expect(entry.startMin).toBe(0)
    expect(entry.endHour).toBe(1)
    expect(entry.endMin).toBe(0)
    expect(entry.crossesMidnight).toBe(true)
  })

  it("filters out monthly_by_date rules - no day-of-month field on ScheduleEntry to hold them", () => {
    const entries = xvmHoursToScheduleEntries([row({ interval: "monthly_by_date", day_of_month: 15 }), row({})])
    expect(entries).toHaveLength(1)
  })

  it("maps known intervals to the display's uppercase labels, falls back to uppercase for unknown ones", () => {
    const [weekly, biweekly, monthlyByWeekday, unknown] = xvmHoursToScheduleEntries([
      row({ interval: "weekly" }),
      row({ interval: "biweekly" }),
      row({ interval: "monthly_by_weekday", week_of_month: 2 }),
      row({ interval: "some_future_interval" }),
    ])
    expect(weekly.interval).toBe("WEEKLY")
    expect(biweekly.interval).toBe("BIWEEKLY")
    expect(monthlyByWeekday.interval).toBe("MONTHLY")
    expect(unknown.interval).toBe("SOME_FUTURE_INTERVAL")
  })
})
