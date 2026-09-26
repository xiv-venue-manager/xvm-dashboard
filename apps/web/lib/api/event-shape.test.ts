import { describe, it, expect } from "vitest"
import { planStatusChange, toDashboardEventShape, toSeriesCreateData } from "./event-shape"
import type { EventItem, EventRow } from "@/lib/api/xvm-api"

const row: EventRow = {
  id: 7,
  title: "Karaoke",
  description: "Sing",
  event_type: "PERFORMANCE",
  location: "Main floor",
  image_url: null,
  starts_at: "2026-10-03T19:00:00Z",
  ends_at: "2026-10-03T22:00:00Z",
  scheduled_at: null,
  published_at: "2026-09-30T00:00:00Z",
  cancelled_at: null,
  cancel_reason: null,
  recurrence_rule_id: 3,
  partake_event_id: 55,
  created_by_person_id: 9,
  created_at: "2026-09-29T00:00:00Z",
  updated_at: "2026-09-29T00:00:00Z",
}

describe("toDashboardEventShape", () => {
  it("maps a row and derives status from the supplied clock", () => {
    const shape = toDashboardEventShape(row, { now: new Date("2026-10-03T20:00:00Z"), creatorName: "Ehno" })
    expect(shape).toMatchObject({
      id: "7",
      materialized: true,
      eventType: "PERFORMANCE",
      status: "ACTIVE",
      startTime: row.starts_at,
      endTime: row.ends_at,
      partakeEventId: 55,
      recurrenceRuleId: 3,
      createdBy: { name: "Ehno", image: null },
    })
  })

  it("leaves createdBy null without a name and blanks the fields xvm-api has no source for", () => {
    const shape = toDashboardEventShape(row, { now: new Date("2026-10-01T00:00:00Z") })
    expect(shape.createdBy).toBeNull()
    expect(shape.attendanceCount).toBeNull()
    expect(shape.revenue).toBeNull()
    expect(shape.status).toBe("PUBLISHED")
  })

  it("keeps a virtual occurrence's null id and falls back to OTHER for a missing type", () => {
    const virtual: EventItem = {
      materialized: false,
      id: null,
      recurrence_rule_id: 3,
      scheduled_at: "2026-10-10T19:00:00Z",
      title: "Karaoke",
      description: null,
      event_type: null,
      location: null,
      image_url: null,
      starts_at: "2026-10-10T19:00:00Z",
      ends_at: "2026-10-10T22:00:00Z",
      published_at: "2026-09-30T00:00:00Z",
      cancelled_at: null,
      cancel_reason: null,
    }
    const shape = toDashboardEventShape(virtual, { now: new Date("2026-10-01T00:00:00Z") })
    expect(shape).toMatchObject({ id: null, materialized: false, eventType: "OTHER", partakeEventId: null })
  })
})

describe("toSeriesCreateData", () => {
  const base = { title: "Karaoke", description: null, event_type: "PERFORMANCE", location: null, publish: true }
  const friday = new Date("2026-10-02T19:30:00Z")
  const end = new Date("2026-10-02T22:00:00Z")

  it("maps WEEKLY to weekly with a Monday-first weekday", () => {
    expect(toSeriesCreateData(base, "WEEKLY", friday, end)).toMatchObject({
      interval: "weekly",
      weekday: 4,
      start_minute_of_day: 19 * 60 + 30,
      duration_minutes: 150,
      timezone: "UTC",
      anchor_date: "2026-10-02",
    })
  })

  it("maps BIWEEKLY to biweekly and Sunday to weekday 6", () => {
    const sunday = new Date("2026-10-04T12:00:00Z")
    expect(toSeriesCreateData(base, "BIWEEKLY", sunday, new Date("2026-10-04T14:00:00Z"))).toMatchObject({
      interval: "biweekly",
      weekday: 6,
    })
  })

  it("maps MONTHLY to monthly_by_date on the start's day of month, matching the old addMonths rule", () => {
    const data = toSeriesCreateData(base, "MONTHLY", friday, end)
    expect(data).toMatchObject({ interval: "monthly_by_date", day_of_month: 2 })
    expect(data.weekday).toBeUndefined()
  })
})

describe("planStatusChange", () => {
  it("does nothing when the status is unset or already current", () => {
    expect(planStatusChange("DRAFT", undefined)).toEqual({ action: "none" })
    expect(planStatusChange("ACTIVE", "ACTIVE")).toEqual({ action: "none" })
  })

  it("publishes a draft and treats PUBLISHED on a started event as unchanged", () => {
    expect(planStatusChange("DRAFT", "PUBLISHED")).toEqual({ action: "publish" })
    expect(planStatusChange("ACTIVE", "PUBLISHED")).toEqual({ action: "none" })
    expect(planStatusChange("COMPLETED", "PUBLISHED")).toEqual({ action: "none" })
  })

  it("cancels from any live state", () => {
    expect(planStatusChange("DRAFT", "CANCELLED")).toEqual({ action: "cancel" })
    expect(planStatusChange("PUBLISHED", "CANCELLED")).toEqual({ action: "cancel" })
  })

  it("rejects unpublishing, un-cancelling and writing derived states", () => {
    expect(planStatusChange("PUBLISHED", "DRAFT").action).toBe("reject")
    expect(planStatusChange("CANCELLED", "PUBLISHED").action).toBe("reject")
    expect(planStatusChange("PUBLISHED", "COMPLETED").action).toBe("reject")
    expect(planStatusChange("PUBLISHED", "ACTIVE").action).toBe("reject")
  })
})
