import { describe, it, expect } from "vitest"
import {
  resolveShiftRate,
  isShiftCovered,
  groupByRate,
  groupPeriod,
  totalMinutesWorked,
  hourlyAmountMinor,
  type ShiftForPayroll,
  type PositionRate,
} from "./payroll-generate"

function shift(overrides: Partial<ShiftForPayroll> & Pick<ShiftForPayroll, "id">): ShiftForPayroll {
  return {
    actualStart: "2026-09-01T20:00:00.000Z",
    actualEnd: "2026-09-01T21:10:00.000Z",
    minutesWorked: 70,
    positionId: 1,
    ...overrides,
  }
}

describe("resolveShiftRate", () => {
  it("uses the shift's own minutesWorked, not a recomputation from timestamps", () => {
    const positionById = new Map<number, PositionRate>([[1, { id: 1, hourlyRateMinor: 2000 }]])
    const resolved = resolveShiftRate(shift({ id: 1, minutesWorked: 70 }), positionById)
    expect(resolved.minutesWorked).toBe(70)
    expect(resolved.hours).toBeCloseTo(70 / 60, 10)
    expect(resolved.rateMinorPerHour).toBe(2000)
  })

  it("three 70-minute shifts sum to exactly 210 minutes worked, no round-trip drift", () => {
    const positionById = new Map<number, PositionRate>([[1, { id: 1, hourlyRateMinor: 2000 }]])
    const shifts = [1, 2, 3].map((id) => resolveShiftRate(shift({ id, minutesWorked: 70 }), positionById))
    expect(totalMinutesWorked(shifts)).toBe(210)
  })

  it("resolves rateMinorPerHour to null when the shift has no position, or the position has no rate", () => {
    const positionById = new Map<number, PositionRate>([[1, { id: 1, hourlyRateMinor: null }]])
    expect(resolveShiftRate(shift({ id: 1, positionId: null }), positionById).rateMinorPerHour).toBeNull()
    expect(resolveShiftRate(shift({ id: 2, positionId: 1 }), positionById).rateMinorPerHour).toBeNull()
  })
})

describe("isShiftCovered", () => {
  it("is true when the shift's actualEnd falls within an existing entry's period", () => {
    const entries = [{ periodStart: "2026-09-25T00:00:00.000Z", periodEnd: "2026-10-05T23:59:59.999Z" }]
    const shiftEndMs = new Date("2026-09-28T22:00:00.000Z").getTime()
    expect(isShiftCovered(shiftEndMs, entries)).toBe(true)
  })

  it("is false when no entry's period contains the shift's actualEnd", () => {
    const entries = [{ periodStart: "2026-08-01T00:00:00.000Z", periodEnd: "2026-08-31T23:59:59.999Z" }]
    const shiftEndMs = new Date("2026-09-28T22:00:00.000Z").getTime()
    expect(isShiftCovered(shiftEndMs, entries)).toBe(false)
  })

  it("catches the double-pay case: an entry whose period_end is outside the window being re-checked still covers a shift inside it", () => {
    // Entry created for Sep 25 - Oct 5 (period_end = Oct 5). A later run re-checks
    // Sep 1 - 30; the entry's period_end (Oct 5) is outside that window, but the
    // entry itself still covers a Sep 28 shift, and must say so.
    const entries = [{ periodStart: "2026-09-25T00:00:00.000Z", periodEnd: "2026-10-05T23:59:59.999Z" }]
    const sep28ShiftEndMs = new Date("2026-09-28T22:00:00.000Z").getTime()
    expect(isShiftCovered(sep28ShiftEndMs, entries)).toBe(true)
  })
})

describe("groupByRate", () => {
  it("groups resolved shifts by their rateMinorPerHour", () => {
    const positionById = new Map<number, PositionRate>([
      [1, { id: 1, hourlyRateMinor: 2000 }],
      [2, { id: 2, hourlyRateMinor: 2500 }],
    ])
    const resolved = [
      resolveShiftRate(shift({ id: 1, positionId: 1 }), positionById),
      resolveShiftRate(shift({ id: 2, positionId: 2 }), positionById),
      resolveShiftRate(shift({ id: 3, positionId: 1 }), positionById),
    ]
    const groups = groupByRate(resolved)
    expect(groups.size).toBe(2)
    expect(groups.get(2000)?.map((r) => r.shift.id)).toEqual([1, 3])
    expect(groups.get(2500)?.map((r) => r.shift.id)).toEqual([2])
  })

  it("pins the current contract: a null-rate shift keys under a literal null, which downstream arithmetic treats as a real $0/hr rate", () => {
    const positionById = new Map<number, PositionRate>([[1, { id: 1, hourlyRateMinor: null }]])
    const resolved = [resolveShiftRate(shift({ id: 1, positionId: 1 }), positionById)]
    const groups = groupByRate(resolved)
    expect(groups.size).toBe(1)
    expect(Array.from(groups.keys())).toEqual([null])
  })
})

describe("groupPeriod", () => {
  it("spans the earliest actualStart to the latest actualEnd in the group", () => {
    const positionById = new Map<number, PositionRate>([[1, { id: 1, hourlyRateMinor: 2000 }]])
    const resolved = [
      resolveShiftRate(
        shift({ id: 1, actualStart: "2026-09-25T20:00:00.000Z", actualEnd: "2026-09-25T22:00:00.000Z" }),
        positionById
      ),
      resolveShiftRate(
        shift({ id: 2, actualStart: "2026-09-30T20:00:00.000Z", actualEnd: "2026-10-05T02:00:00.000Z" }),
        positionById
      ),
    ]
    expect(groupPeriod(resolved)).toEqual({
      start: "2026-09-25T20:00:00.000Z",
      end: "2026-10-05T02:00:00.000Z",
    })
  })
})

describe("hourlyAmountMinor", () => {
  it("matches xvm-api's ceiling-division formula: two 1h10m shifts at $20/h is $46.67, not $46.80", () => {
    // Two 1h10m shifts = 140 minutes. Per-shift rounding (the old preview bug) gives
    // round(1.17h * 2000) * 2 = 2340 * 2 = 4680 minor ($46.80). The server computes
    // ceil(2000 * 140 / 60) = 4667 minor ($46.67) once, over the group's total minutes.
    expect(hourlyAmountMinor(2000, 140)).toBe(4667)
  })

  it("rounds a partial minute up, never down, matching the server's stated intent", () => {
    expect(hourlyAmountMinor(2000, 1)).toBe(34) // ceil(2000/60) = 33.33 -> 34
  })

  it("is exact with no remainder", () => {
    expect(hourlyAmountMinor(1800, 60)).toBe(1800)
  })
})
