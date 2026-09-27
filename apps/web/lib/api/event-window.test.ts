import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockListEvents, mockMaterialize } = vi.hoisted(() => ({ mockListEvents: vi.fn(), mockMaterialize: vi.fn() }))

vi.mock("@/lib/api/xvm-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/xvm-api")>()),
  listEvents: mockListEvents,
  materializeEvent: mockMaterialize,
}))

import { listEventsInRange, materializeIfVirtual, toPageEvent } from "./event-window"
import { toDashboardEventShape } from "./event-shape"
import type { EventItem, EventRow } from "@/lib/api/xvm-api"

const DAY = 86400000
const item = (over: Partial<EventItem>): EventItem => ({
  materialized: true,
  id: 1,
  recurrence_rule_id: null,
  scheduled_at: null,
  title: "Karaoke",
  description: null,
  event_type: "SOCIAL",
  location: null,
  image_url: null,
  starts_at: "2026-10-01T19:00:00Z",
  ends_at: "2026-10-01T22:00:00Z",
  published_at: "2026-09-01T00:00:00Z",
  cancelled_at: null,
  cancel_reason: null,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockListEvents.mockResolvedValue([])
})

describe("listEventsInRange", () => {
  it("makes one call for a range within the 60 day cap", async () => {
    const from = new Date("2026-10-01T00:00:00Z")
    await listEventsInRange("tok", "xv-1", from, new Date(from.getTime() + 60 * DAY))
    expect(mockListEvents).toHaveBeenCalledTimes(1)
  })

  it("splits a longer range into contiguous windows of at most 60 days", async () => {
    const from = new Date("2026-06-01T00:00:00Z")
    const to = new Date(from.getTime() + 150 * DAY)
    await listEventsInRange("tok", "xv-1", from, to)
    const calls = mockListEvents.mock.calls.map(([, , params]) => [new Date(params.from), new Date(params.to)])
    expect(calls).toHaveLength(3)
    expect(calls[0][0]).toEqual(from)
    expect(calls[2][1]).toEqual(to)
    for (let i = 1; i < calls.length; i++) expect(calls[i][0]).toEqual(calls[i - 1][1])
    for (const [start, end] of calls) expect(end.getTime() - start.getTime()).toBeLessThanOrEqual(60 * DAY)
  })

  it("dedupes an event returned by two windows and sorts by start", async () => {
    const early = item({ id: 1, starts_at: "2026-10-01T19:00:00Z" })
    const late = item({ id: 2, starts_at: "2026-12-01T19:00:00Z" })
    mockListEvents.mockResolvedValueOnce([late, early]).mockResolvedValueOnce([early])
    const from = new Date("2026-09-25T00:00:00Z")
    const events = await listEventsInRange("tok", "xv-1", from, new Date(from.getTime() + 100 * DAY))
    expect(events.map((e) => e.id)).toEqual(["1", "2"])
    expect(events[0].startTime).toBeInstanceOf(Date)
  })

  it("keeps distinct virtual occurrences of one series", async () => {
    mockListEvents.mockResolvedValue([
      item({ id: null, materialized: false, recurrence_rule_id: 3, starts_at: "2026-10-08T19:00:00Z" }),
      item({ id: null, materialized: false, recurrence_rule_id: 3, starts_at: "2026-10-15T19:00:00Z" }),
    ])
    const from = new Date("2026-10-01T00:00:00Z")
    const events = await listEventsInRange("tok", "xv-1", from, new Date(from.getTime() + 30 * DAY))
    expect(events).toHaveLength(2)
  })

  it("passes includeCancelled through", async () => {
    const from = new Date("2026-10-01T00:00:00Z")
    await listEventsInRange("tok", "xv-1", from, new Date(from.getTime() + DAY), { includeCancelled: true })
    expect(mockListEvents.mock.calls[0][2].includeCancelled).toBe(true)
  })
})

describe("materializeIfVirtual", () => {
  const virtual = toPageEvent(
    toDashboardEventShape(
      item({ id: null, materialized: false, recurrence_rule_id: 3, scheduled_at: "2026-10-08T19:00:00Z" })
    )
  )

  it("returns a real event untouched without calling xvm-api", async () => {
    const real = toPageEvent(toDashboardEventShape(item({ id: 9 })))
    expect(await materializeIfVirtual("tok", "xv-1", real)).toBe(real)
    expect(mockMaterialize).not.toHaveBeenCalled()
  })

  it("materializes a virtual occurrence by rule and scheduled time and returns the real row", async () => {
    const row: EventRow = {
      id: 44,
      title: "Karaoke",
      description: null,
      event_type: "SOCIAL",
      location: null,
      image_url: null,
      starts_at: "2026-10-08T19:00:00Z",
      ends_at: "2026-10-08T22:00:00Z",
      scheduled_at: "2026-10-08T19:00:00Z",
      published_at: "2026-09-01T00:00:00Z",
      cancelled_at: null,
      cancel_reason: null,
      recurrence_rule_id: 3,
      partake_event_id: null,
      created_by_person_id: null,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    }
    mockMaterialize.mockResolvedValue(row)
    const event = await materializeIfVirtual("tok", "xv-1", virtual)
    expect(mockMaterialize).toHaveBeenCalledWith("tok", "xv-1", {
      recurrence_rule_id: 3,
      scheduled_at: "2026-10-08T19:00:00Z",
    })
    expect(event.id).toBe("44")
    expect(event.startTime).toBeInstanceOf(Date)
  })
})
