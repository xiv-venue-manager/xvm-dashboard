import { describe, expect, it } from "vitest"
import { pickSaleEvents, RECENT_SALE_EVENT_LIMIT } from "./sale-events"

type Input = Parameters<typeof pickSaleEvents>[0][number]

const event = (id: string | null, status: string, startTime: string, title = `Event ${id}`): Input => ({
  id,
  title,
  status,
  startTime,
})

describe("pickSaleEvents", () => {
  it("finds no live event and no recent ones in an empty list", () => {
    expect(pickSaleEvents([])).toEqual({ live: null, recent: [] })
  })

  it("takes the latest-starting active event as live when two overlap", () => {
    const early = event("1", "ACTIVE", "2026-11-14T18:00:00Z")
    const late = event("2", "ACTIVE", "2026-11-14T20:00:00Z")
    expect(pickSaleEvents([late, early]).live?.id).toBe("2")
  })

  it("ignores an active occurrence that has no id yet", () => {
    expect(pickSaleEvents([event(null, "ACTIVE", "2026-11-14T20:00:00Z")]).live).toBeNull()
  })

  it("never offers drafts, upcoming or cancelled events", () => {
    const list = [
      event("1", "DRAFT", "2026-11-10T20:00:00Z"),
      event("2", "PUBLISHED", "2026-11-20T20:00:00Z"),
      event("3", "CANCELLED", "2026-11-11T20:00:00Z"),
    ]
    expect(pickSaleEvents(list)).toEqual({ live: null, recent: [] })
  })

  it("lists completed events newest first and leaves the live one out of the recent list", () => {
    const list = [
      event("1", "COMPLETED", "2026-11-08T20:00:00Z"),
      event("2", "COMPLETED", "2026-11-12T20:00:00Z"),
      event("3", "ACTIVE", "2026-11-14T20:00:00Z"),
    ]
    const picked = pickSaleEvents(list)
    expect(picked.live?.id).toBe("3")
    expect(picked.recent.map((e) => e.id)).toEqual(["2", "1"])
  })

  it("caps the recent list", () => {
    const list = Array.from({ length: RECENT_SALE_EVENT_LIMIT + 5 }, (_, i) =>
      event(String(i + 1), "COMPLETED", `2026-10-${String(i + 1).padStart(2, "0")}T20:00:00Z`)
    )
    expect(pickSaleEvents(list).recent).toHaveLength(RECENT_SALE_EVENT_LIMIT)
  })
})
