import { describe, it, expect } from "vitest"

import { deriveEventStatus, type EventStatusInput } from "./event-status"

const STARTS = "2026-10-03T19:00:00Z"
const ENDS = "2026-10-03T22:00:00Z"

const published: EventStatusInput = { starts_at: STARTS, ends_at: ENDS, published_at: "2026-09-30T12:00:00Z", cancelled_at: null }
const draft: EventStatusInput = { ...published, published_at: null }
const cancelled: EventStatusInput = { ...published, cancelled_at: "2026-10-01T09:00:00Z" }

const at = (iso: string) => new Date(iso)

describe("deriveEventStatus", () => {
  it("is DRAFT when unpublished, even after the event has passed", () => {
    expect(deriveEventStatus(draft, at("2026-10-01T00:00:00Z"))).toBe("DRAFT")
    expect(deriveEventStatus(draft, at("2026-10-05T00:00:00Z"))).toBe("DRAFT")
  })

  it("is PUBLISHED before the start", () => {
    expect(deriveEventStatus(published, at("2026-10-03T18:59:59.999Z"))).toBe("PUBLISHED")
  })

  it("is ACTIVE from the start instant", () => {
    expect(deriveEventStatus(published, at(STARTS))).toBe("ACTIVE")
  })

  it("is ACTIVE mid-event", () => {
    expect(deriveEventStatus(published, at("2026-10-03T20:30:00Z"))).toBe("ACTIVE")
  })

  it("is still ACTIVE at the end instant, matching the API's live rule", () => {
    expect(deriveEventStatus(published, at(ENDS))).toBe("ACTIVE")
  })

  it("is COMPLETED just after the end", () => {
    expect(deriveEventStatus(published, at("2026-10-03T22:00:00.001Z"))).toBe("COMPLETED")
  })

  it("is CANCELLED whatever the time", () => {
    expect(deriveEventStatus(cancelled, at("2026-10-02T00:00:00Z"))).toBe("CANCELLED")
    expect(deriveEventStatus(cancelled, at("2026-10-03T20:00:00Z"))).toBe("CANCELLED")
    expect(deriveEventStatus(cancelled, at("2026-10-05T00:00:00Z"))).toBe("CANCELLED")
  })

  it("is CANCELLED for a cancelled draft", () => {
    expect(deriveEventStatus({ ...draft, cancelled_at: "2026-10-01T09:00:00Z" }, at("2026-10-02T00:00:00Z"))).toBe("CANCELLED")
  })

  it("accepts a list item as well as a full row", () => {
    const item = { ...published, materialized: false, id: null }
    expect(deriveEventStatus(item, at("2026-10-03T20:00:00Z"))).toBe("ACTIVE")
  })
})
