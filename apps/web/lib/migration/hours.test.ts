import { describe, it, expect } from "vitest"
import { mapHours, type ExportedScheduleEntry } from "./hours"

const entry = (over: Partial<ExportedScheduleEntry> = {}): ExportedScheduleEntry => ({
  id: "h1",
  venueId: "v1",
  day: 5,
  startHour: 19,
  startMin: 0,
  endHour: 22,
  endMin: 0,
  crossesMidnight: false,
  interval: "WEEKLY",
  weekOfMonth: null,
  commencing: null,
  label: null,
  createdAt: "2026-03-01T10:00:00.000Z",
  ...over,
})

const run = (entries: ExportedScheduleEntry[], syncedVenues: string[] = []) => mapHours({ entries, syncedVenues })

describe("mapHours", () => {
  it("maps a weekly entry to a manual hours row with a rule in UTC", () => {
    expect(run([entry({ label: " DJ  Night " })]).hours).toEqual([
      {
        key: "h1", venue_key: "v1", label: "DJ Night", source: "manual",
        rule: {
          interval: "weekly", weekday: 4, day_of_month: null, week_of_month: null, start_minute_of_day: 1140,
          duration_minutes: 180, timezone: "UTC", anchor_date: "2026-03-01", ends_on: null, ends_after_count: null, enabled: true,
        },
      },
    ])
  })

  it("turns Sunday-first days into Monday-first weekdays", () => {
    const r = run([0, 1, 2, 3, 4, 5, 6].map((day) => entry({ id: `d${day}`, day })))
    expect(r.hours.map((h) => h.rule.weekday)).toEqual([6, 0, 1, 2, 3, 4, 5])
  })

  it("lets an entry end after midnight when it is flagged", () => {
    const r = run([entry({ startHour: 22, endHour: 2, crossesMidnight: true })])
    expect(r.hours[0].rule.duration_minutes).toBe(240)
    expect(r.warnings).toEqual([])
  })

  it("treats an end before the start as the next day even without the flag, and counts it", () => {
    const r = run([entry({ startHour: 22, endHour: 2, crossesMidnight: false })])
    expect(r.hours[0].rule.duration_minutes).toBe(240)
    expect(r.warnings).toEqual([{ key: "hours", message: "1 entries ended before they started without the crosses-midnight flag, treated as ending the next day" }])
  })

  it("gives an entry with no end a three hour length, and counts it", () => {
    const r = run([entry({ endHour: null, endMin: null })])
    expect(r.hours[0].rule.duration_minutes).toBe(180)
    expect(r.warnings[0].message).toContain("no end time")
  })

  it("maps biweekly on its start date, and warns if it has none", () => {
    const r = run([entry({ id: "a", interval: "BIWEEKLY", commencing: "2026-02-10T00:00:00.000Z" }), entry({ id: "b", interval: "BIWEEKLY" })])
    expect(r.hours.map((h) => [h.rule.interval, h.rule.anchor_date])).toEqual([["biweekly", "2026-02-10"], ["biweekly", "2026-03-01"]])
    expect(r.warnings.map((w) => w.key)).toEqual(["b"])
  })

  it("maps monthly to a weekday slot, with the last week as -1", () => {
    const r = run([entry({ id: "a", interval: "MONTHLY", weekOfMonth: 2 }), entry({ id: "b", interval: "MONTHLY", weekOfMonth: 5 })])
    expect(r.hours.map((h) => [h.rule.interval, h.rule.week_of_month])).toEqual([["monthly_by_weekday", 2], ["monthly_by_weekday", -1]])
  })

  it("skips a monthly entry with no week of the month", () => {
    expect(run([entry({ interval: "MONTHLY", weekOfMonth: null })]).skipped).toEqual([{ key: "h1", reason: "monthly entry without a week of the month" }])
  })

  it("leaves out the entries of a venue whose hours come from ffxivvenues.com", () => {
    const r = run([entry({ id: "a", venueId: "synced" }), entry({ id: "b", venueId: "manual" })], ["synced"])
    expect(r.hours.map((h) => h.key)).toEqual(["b"])
    expect(r.skipped).toEqual([{ key: "a", reason: "this venue's hours come from ffxivvenues.com" }])
  })

  it("skips an out-of-range day or start time", () => {
    const r = run([entry({ id: "a", day: 7 }), entry({ id: "b", startHour: 24 })])
    expect(r.hours).toEqual([])
    expect(r.skipped).toHaveLength(2)
  })

  it("cuts a label to 100 characters", () => {
    expect(run([entry({ label: "L".repeat(120) })]).hours[0].label).toHaveLength(100)
  })
})
