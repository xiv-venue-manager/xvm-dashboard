import { describe, it, expect } from "vitest"
import { openingStatus } from "./public-venue-status"
import type { OpeningRow } from "@/lib/api/xvm-api"

const now = new Date("2026-10-24T20:00:00Z")
const row = (starts_at: string, ends_at: string): OpeningRow => ({ hours_id: 1, label: null, starts_at, ends_at })

describe("openingStatus", () => {
  it("reports nothing for a venue with no hours", () => {
    expect(openingStatus(undefined, now)).toEqual({ openSince: null, scheduledEnd: null, nextOpen: null })
  })

  it("reports an opening in progress by its own start and end", () => {
    const current = row("2026-10-24T19:00:00Z", "2026-10-25T02:00:00Z")
    expect(openingStatus({ open: true, current, next: null }, now)).toEqual({
      openSince: current.starts_at,
      scheduledEnd: current.ends_at,
      nextOpen: null,
    })
  })

  it("reports an opening later today as tonight's, with its end", () => {
    const next = row("2026-10-24T22:00:00Z", "2026-10-25T03:00:00Z")
    expect(openingStatus({ open: false, current: null, next }, now)).toEqual({
      openSince: null,
      scheduledEnd: next.ends_at,
      nextOpen: next.starts_at,
    })
  })

  it("does not call an opening on a later day tonight", () => {
    const next = row("2026-10-25T00:00:00Z", "2026-10-25T05:00:00Z")
    expect(openingStatus({ open: false, current: null, next }, now)).toEqual({
      openSince: null,
      scheduledEnd: null,
      nextOpen: null,
    })
  })

  it("keeps the current end when a later opening is also tonight", () => {
    const current = row("2026-10-24T18:00:00Z", "2026-10-24T21:00:00Z")
    const next = row("2026-10-24T22:00:00Z", "2026-10-25T01:00:00Z")
    expect(openingStatus({ open: true, current, next }, now)).toEqual({
      openSince: current.starts_at,
      scheduledEnd: current.ends_at,
      nextOpen: next.starts_at,
    })
  })
})
