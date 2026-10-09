import { describe, it, expect } from "vitest"
import { mapEvents, type ExportedEvent } from "./events"

const event = (over: Partial<ExportedEvent> = {}): ExportedEvent => ({
  id: "e1",
  venueId: "v1",
  title: "Friday Night",
  description: null,
  location: null,
  eventType: "SOCIAL",
  status: "PUBLISHED",
  startTime: "2026-01-02T19:00:00.000Z",
  endTime: "2026-01-02T22:00:00.000Z",
  timezone: "UTC",
  recurrenceRule: null,
  parentEventId: null,
  partakeEventId: null,
  discordMessageId: null,
  discordWebhookGroup: null,
  discordCancelledAt: null,
  discordReminderSentAt: null,
  attendanceCount: null,
  revenue: null,
  createdById: "u1",
  createdAt: "2025-12-20T10:00:00.000Z",
  updatedAt: "2025-12-21T10:00:00.000Z",
  ...over,
})

const people = new Set(["u1"])
const run = (events: ExportedEvent[], keys: ReadonlySet<string> = people) => mapEvents({ events }, keys)

describe("single events", () => {
  it("maps a published event and keeps it out of any series", () => {
    const r = run([event()])
    expect(r.rules).toEqual([])
    expect(r.events[0]).toMatchObject({
      key: "e1", rule_key: null, scheduled_at: null, title: "Friday Night", event_type: "SOCIAL",
      starts_at: "2026-01-02T19:00:00.000Z", ends_at: "2026-01-02T22:00:00.000Z",
      published_at: "2025-12-20T10:00:00.000Z", cancelled_at: null, created_by_person_key: "u1",
    })
  })

  it("leaves a draft unpublished", () => {
    expect(run([event({ status: "DRAFT" })]).events[0].published_at).toBeNull()
  })

  it("treats active and completed as published", () => {
    const r = run([event({ id: "a", status: "ACTIVE" }), event({ id: "c", status: "COMPLETED", startTime: "2026-01-03T19:00:00.000Z", endTime: "2026-01-03T22:00:00.000Z" })])
    expect(r.events.map((e) => e.published_at)).toEqual(["2025-12-20T10:00:00.000Z", "2025-12-20T10:00:00.000Z"])
  })

  it("dates a cancelled event by its last update, and does not publish it", () => {
    const e = run([event({ status: "CANCELLED" })]).events[0]
    expect(e.cancelled_at).toBe("2025-12-21T10:00:00.000Z")
    expect(e.published_at).toBeNull()
  })

  it("moves an end that is not after the start to three hours later, and says so", () => {
    const r = run([event({ endTime: "2026-01-02T19:00:00.000Z" })])
    expect(r.events[0].ends_at).toBe("2026-01-02T22:00:00.000Z")
    expect(r.warnings).toEqual([{ key: "e1", message: "end is not after start, set to start plus 3 hours" }])
  })

  it("cuts a title over 200 characters and puts the whole title at the top of the description", () => {
    const title = "T".repeat(218)
    const r = run([event({ title, description: "Details" })])
    expect(r.events[0].title).toHaveLength(200)
    expect(r.events[0].description).toBe(`${title}\n\nDetails`)
    expect(r.warnings).toHaveLength(1)
  })

  it("uses the whole title as the description when there was none", () => {
    expect(run([event({ title: "T".repeat(210) })]).events[0].description).toBe("T".repeat(210))
  })

  it("carries the Partake id and the reminder and cancel notice times", () => {
    const r = run([event({ partakeEventId: 4821, discordReminderSentAt: "2026-01-02T12:00:00.000Z", discordCancelledAt: "2026-01-01T09:00:00.000Z" })])
    expect(r.events[0]).toMatchObject({
      partake_event_id: 4821, reminder_sent_at: "2026-01-02T12:00:00.000Z", cancel_notice_sent_at: "2026-01-01T09:00:00.000Z",
    })
  })

  it("warns when Discord post tracking cannot be carried", () => {
    const r = run([event({ discordMessageId: "123" })])
    expect(r.warnings[0].message).toContain("Discord post tracking")
  })

  it("leaves created_by empty, with a warning, when the creator was not loaded", () => {
    const r = run([event({ createdById: "ghost" })])
    expect(r.events[0].created_by_person_key).toBeNull()
    expect(r.warnings).toHaveLength(1)
  })

  it("reports attendance and revenue that have no home, as totals", () => {
    const r = run([event({ attendanceCount: 12, revenue: 42400 }), event({ id: "e2", startTime: "2026-01-03T19:00:00.000Z", endTime: "2026-01-03T22:00:00.000Z" })])
    expect(r.totals).toEqual([{ event_key: "e1", attendance_count: 12, revenue_minor: 42400 }])
  })
})

describe("series", () => {
  const weekly = (id: string, startTime: string, over: Partial<ExportedEvent> = {}) =>
    event({
      id, startTime, endTime: new Date(new Date(startTime).getTime() + 3 * 3600_000).toISOString(),
      timezone: "America/Edmonton", recurrenceRule: null, ...over,
    })

  it("turns a weekly parent and its children into one rule and tied occurrences", () => {
    const parent = weekly("p", "2026-01-06T02:00:00.000Z", { recurrenceRule: "WEEKLY" })
    const child = weekly("c1", "2026-01-13T02:00:00.000Z", { parentEventId: "p" })
    const r = run([child, parent])
    expect(r.rules).toEqual([
      {
        key: "p", venue_key: "v1", interval: "weekly", weekday: 0, day_of_month: null, week_of_month: null,
        start_minute_of_day: 1140, duration_minutes: 180, timezone: "America/Edmonton", anchor_date: "2026-01-05",
        ends_on: null, ends_after_count: null, enabled: true,
      },
    ])
    expect(r.events.map((e) => [e.key, e.rule_key, e.scheduled_at])).toEqual([
      ["p", "p", "2026-01-06T02:00:00.000Z"],
      ["c1", "p", "2026-01-13T02:00:00.000Z"],
    ])
    expect(r.warnings).toEqual([])
  })

  it("maps biweekly", () => {
    const r = run([weekly("p", "2026-01-06T02:00:00.000Z", { recurrenceRule: "BIWEEKLY" })])
    expect(r.rules[0].interval).toBe("biweekly")
  })

  it("keeps a daylight-saving-shifted occurrence at its real time but ties it to the series' own slot", () => {
    const parent = weekly("p", "2026-03-07T02:00:00.000Z", { recurrenceRule: "WEEKLY" })
    const child = weekly("c1", "2026-03-14T02:00:00.000Z", { parentEventId: "p" })
    const r = run([parent, child])
    expect(r.rules[0].weekday).toBe(4)
    expect(r.events.map((e) => [e.starts_at, e.scheduled_at])).toEqual([
      ["2026-03-07T02:00:00.000Z", "2026-03-07T02:00:00.000Z"],
      ["2026-03-14T02:00:00.000Z", "2026-03-14T01:00:00.000Z"],
    ])
    expect(r.warnings).toEqual([
      { key: "p", message: "1 of 2 occurrences start at a different local time than the series, daylight saving or an edit, their real times are kept" },
    ])
  })

  it("takes the series time from the most common start, not an edited first occurrence", () => {
    const parent = event({ id: "p", recurrenceRule: "WEEKLY", startTime: "2026-01-02T16:00:00.000Z", endTime: "2026-01-02T19:00:00.000Z" })
    const kids = ["2026-01-09", "2026-01-16", "2026-01-23"].map((d, i) =>
      event({ id: `c${i}`, parentEventId: "p", startTime: `${d}T19:00:00.000Z`, endTime: `${d}T22:00:00.000Z` })
    )
    const r = run([parent, ...kids])
    expect(r.rules[0].start_minute_of_day).toBe(19 * 60)
    expect(r.events[0]).toMatchObject({ starts_at: "2026-01-02T16:00:00.000Z", scheduled_at: "2026-01-02T19:00:00.000Z" })
  })

  it("keeps a monthly-by-date series when one occurrence was moved a day", () => {
    const at = (id: string, d: string, parentEventId: string | null = "p") =>
      event({ id, parentEventId, recurrenceRule: id === "p" ? "MONTHLY" : null, startTime: `${d}T19:00:00.000Z`, endTime: `${d}T22:00:00.000Z` })
    const r = run([at("p", "2026-01-25", null), at("a", "2026-02-25"), at("b", "2026-03-26"), at("c", "2026-04-25")])
    expect(r.rules[0]).toMatchObject({ interval: "monthly_by_date", day_of_month: 25, weekday: null })
    expect(r.warnings).toEqual([{ key: "p", message: "1 of 4 occurrences are not on the series' date, their real dates are kept" }])
  })

  it("keeps the earlier of two occurrences that land on one series slot", () => {
    const parent = weekly("p", "2026-01-06T02:00:00.000Z", { recurrenceRule: "WEEKLY" })
    const twin = weekly("c1", "2026-01-06T02:30:00.000Z", { parentEventId: "p" })
    const r = run([parent, twin])
    expect(r.events.map((e) => e.key)).toEqual(["p"])
    expect(r.skipped).toEqual([{ key: "c1", reason: "belongs to a series that was not mapped" }])
    expect(r.warnings.some((w) => w.message.includes("share one series slot"))).toBe(true)
  })

  it("makes a monthly series on a fixed date a by-date rule", () => {
    const parent = event({ id: "p", recurrenceRule: "MONTHLY", startTime: "2026-01-15T19:00:00.000Z", endTime: "2026-01-15T22:00:00.000Z" })
    const a = event({ id: "a", parentEventId: "p", startTime: "2026-02-15T19:00:00.000Z", endTime: "2026-02-15T22:00:00.000Z" })
    const b = event({ id: "b", parentEventId: "p", startTime: "2026-03-15T19:00:00.000Z", endTime: "2026-03-15T22:00:00.000Z" })
    expect(run([parent, a, b]).rules[0]).toMatchObject({ interval: "monthly_by_date", day_of_month: 15, weekday: null, week_of_month: null })
  })

  it("makes a monthly series on the same weekday a by-weekday rule", () => {
    const parent = event({ id: "p", recurrenceRule: "MONTHLY", startTime: "2026-01-02T19:00:00.000Z", endTime: "2026-01-02T22:00:00.000Z" })
    const a = event({ id: "a", parentEventId: "p", startTime: "2026-02-06T19:00:00.000Z", endTime: "2026-02-06T22:00:00.000Z" })
    const b = event({ id: "b", parentEventId: "p", startTime: "2026-03-06T19:00:00.000Z", endTime: "2026-03-06T22:00:00.000Z" })
    const r = run([parent, a, b])
    expect(r.rules[0]).toMatchObject({ interval: "monthly_by_weekday", weekday: 4, week_of_month: 1, day_of_month: null })
    expect(r.warnings).toEqual([])
  })

  it("skips a series with a recurrence it does not know, and its children", () => {
    const parent = weekly("p", "2026-01-06T02:00:00.000Z", { recurrenceRule: "DAILY" })
    const child = weekly("c1", "2026-01-13T02:00:00.000Z", { parentEventId: "p" })
    const r = run([parent, child])
    expect(r.rules).toEqual([])
    expect(r.skipped.map((s) => s.key)).toEqual(["p", "c1"])
    expect(r.events.map((e) => e.key)).toEqual(["p"])
  })

  it("skips an occurrence whose parent is missing", () => {
    const r = run([weekly("c1", "2026-01-13T02:00:00.000Z", { parentEventId: "gone" })])
    expect(r.events).toEqual([])
    expect(r.skipped).toEqual([{ key: "c1", reason: "parent event not found" }])
  })
})
