# Payroll Generate: Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the six findings from Allegro's `CHANGES_REQUESTED` review on xvm-dashboard PR #55 (payroll shift-based generation cutover to xvm-api), without regressing the parts of the PR the review called correct.

**Architecture:** Extract the payroll math (shift-rate resolution, rate grouping, minutes totals, the ceiling-division amount formula that mirrors xvm-api's `PayrollService.create_manual`) into a new pure, unit-tested module `apps/web/lib/payroll-generate.ts`, following the existing `pot-payroll.ts` convention (lean input types decoupled from the xvm-api wire types, so tests don't need full row fixtures). Add a timezone-aware end-of-day helper to the existing `apps/web/lib/local-day.ts`. Wire both into `generate/route.ts` (single-member) and `generate-all/route.ts` (all-members), which currently duplicate this math with two independent bugs in it.

**Tech Stack:** TypeScript, Next.js route handlers, Vitest, xvm-api REST client (`apps/web/lib/api/xvm-api.ts`).

---

## Findings this plan fixes (from the PR #55 review)

1. **Blocking — double-pay.** The "already covered by an existing entry" check queries entries over the *requested window only* (`from`..`to`). xvm-api's `PayrollService.list_for_venue` filters entries by `period_end >= window_from AND period_end < window_to` — so an entry whose `period_end` falls *after* the window (because `groupPeriod` sets it to the group's own last shift time, which can cross into the next window) is invisible to a later run that re-checks an overlapping period, and its shifts look "eligible" again. Concrete repro in the review: generate Sep 25–Oct 5 (entry `period_end` = Oct 5), then generate Sep 1–30 — the Sep 25–30 shifts get paid twice.
2. **Correctness — precision loss.** Shift minutes are computed by rounding to 2-decimal hours, summing, then multiplying back by 60. Three 70-minute shifts (210 real minutes) become 211 minutes after the round-trip.
3. **Correctness — preview/actual mismatch.** The GET preview sums `round(hours × rate)` per shift. The POST that actually creates the entry uses xvm-api's ceiling-division formula once per rate-group over the group's total minutes. Same input, two different totals.
4. **Correctness — timezone.** The window's end is forced to UTC end-of-day regardless of the venue's own timezone, so a venue at a negative UTC offset can have its late-evening local shifts silently excluded from a "generate for this period" run.
5. **Minor — GET id validation.** `Number(membershipIdParam)` on a non-numeric string is `NaN`, which silently matches zero shifts (a confusing "no eligible shifts" instead of a 400).
6. **Minor — partial-failure reporting.** `POST /generate`'s per-rate-group `Promise.all` throws generically if a later group's create call fails after an earlier one succeeded, giving no indication that an entry already landed.

Findings 1 and 4 are explicitly cross-referenced by the reviewer as applying identically to `generate-all/route.ts`. Findings 2 and 3 are the same duplicated math in `generate-all/route.ts`'s `computeAllMembers`, fixed as a consequence of routing both files through the same shared module — not separately re-implemented.

---

## File Structure

- **Create:** `apps/web/lib/payroll-generate.ts` — pure payroll math: shift rate resolution, coverage check, rate grouping, group period, minutes totals, ceiling amount formula. No existing file does this; `generate/route.ts` and `generate-all/route.ts` each currently define their own private (and buggy) copy of it inline.
- **Create:** `apps/web/lib/payroll-generate.test.ts` — unit tests for the above.
- **Modify:** `apps/web/lib/local-day.ts` — add `endOfLocalDayUtc`, called from both route files below.
- **Modify:** `apps/web/lib/local-day.test.ts` — tests for `endOfLocalDayUtc`.
- **Modify:** `apps/web/app/api/venues/[venueId]/payroll/generate/route.ts` — fixes 1, 2, 3, 4, 5, 6.
- **Modify:** `apps/web/app/api/venues/[venueId]/payroll/generate-all/route.ts` — fixes 1, 2, 3, 4 (mirrored).

---

### Task 1: Shared payroll math module

**Files:**
- Create: `apps/web/lib/payroll-generate.ts`
- Test: `apps/web/lib/payroll-generate.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/web/lib/payroll-generate.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run payroll-generate`
Expected: FAIL — `Cannot find module './payroll-generate'` (the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```typescript
// apps/web/lib/payroll-generate.ts

/**
 * Payroll's shift math, shared by the single-member and all-members generate
 * routes so they can't drift apart the way they had: one used to round shift
 * durations to 2-decimal hours then multiply back to minutes (precision loss),
 * and separately rounded a per-shift amount rather than mirroring xvm-api's
 * per-rate-group ceiling-division formula (preview/actual mismatch).
 */

export interface ShiftForPayroll {
  id: number
  actualStart: string
  actualEnd: string
  /** xvm-api's own ShiftRow.worked_minutes - never re-derived from the
   * timestamps here, so this can't drift from what the server considers
   * "worked minutes" for the same shift. */
  minutesWorked: number
  positionId: number | null
}

export interface PositionRate {
  id: number
  hourlyRateMinor: number | null
}

export interface PayrollEntryWindow {
  periodStart: string
  periodEnd: string
}

export interface ResolvedShift {
  shift: ShiftForPayroll
  minutesWorked: number
  /** Decimal hours, display only - all money math uses minutesWorked directly. */
  hours: number
  rateMinorPerHour: number | null
}

export function resolveShiftRate(shift: ShiftForPayroll, positionById: Map<number, PositionRate>): ResolvedShift {
  const position = shift.positionId !== null ? positionById.get(shift.positionId) : undefined
  const rateMinorPerHour = position?.hourlyRateMinor ?? null
  return { shift, minutesWorked: shift.minutesWorked, hours: shift.minutesWorked / 60, rateMinorPerHour }
}

/**
 * True if an existing payroll entry's period already covers this shift's end
 * time. Window-overlap is the only eligibility signal available - xvm-api has
 * no explicit shift-to-payroll-entry link - so callers must fetch candidate
 * entries generously (not bounded to the same window being generated for);
 * see the `to: now` comment at each call site.
 */
export function isShiftCovered(shiftEndMs: number, entries: PayrollEntryWindow[]): boolean {
  return entries.some((entry) => {
    const start = new Date(entry.periodStart).getTime()
    const end = new Date(entry.periodEnd).getTime()
    return shiftEndMs >= start && shiftEndMs <= end
  })
}

export function groupByRate(resolved: ResolvedShift[]): Map<number, ResolvedShift[]> {
  const groups = new Map<number, ResolvedShift[]>()
  for (const r of resolved) {
    const rate = r.rateMinorPerHour!
    const existing = groups.get(rate)
    if (existing) {
      existing.push(r)
    } else {
      groups.set(rate, [r])
    }
  }
  return groups
}

export function groupPeriod(group: ResolvedShift[]): { start: string; end: string } {
  const starts = group.map((r) => new Date(r.shift.actualStart).getTime())
  const ends = group.map((r) => new Date(r.shift.actualEnd).getTime())
  return {
    start: new Date(Math.min(...starts)).toISOString(),
    end: new Date(Math.max(...ends)).toISOString(),
  }
}

export function totalMinutesWorked(group: ResolvedShift[]): number {
  return group.reduce((sum, r) => sum + r.minutesWorked, 0)
}

/**
 * Matches xvm-api's PayrollService.create_manual exactly:
 *   base_total = -(-base_rate_minor * minutes_worked // 60)
 * Python's `-(-a // b)` is ceiling division; `Math.ceil` here is the same
 * operation. Applied once per rate-group over the group's total minutes, not
 * per shift - a per-shift rounding gives a different (wrong) total.
 */
export function hourlyAmountMinor(rateMinorPerHour: number, minutesWorked: number): number {
  return Math.ceil((rateMinorPerHour * minutesWorked) / 60)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run payroll-generate`
Expected: PASS (all tests in `payroll-generate.test.ts`)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/payroll-generate.ts apps/web/lib/payroll-generate.test.ts
git commit -m "$(cat <<'EOF'
Add shared payroll math module

Extracts shift-rate resolution, coverage checking, rate grouping, and the
ceiling-division amount formula out of generate/route.ts and generate-all/
route.ts, which had each independently re-implemented this math with two
different bugs in it (a precision-losing hours round-trip, and a per-shift
rounding that doesn't match xvm-api's per-rate-group ceiling formula). Not
yet wired into either route - that's the next two tasks.
EOF
)"
```

---

### Task 2: Timezone-aware end-of-day helper

**Files:**
- Modify: `apps/web/lib/local-day.ts`
- Modify: `apps/web/lib/local-day.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/lib/local-day.test.ts` (new `describe` block, keep the existing ones, extend the existing import line):

```typescript
import { localDayKey, localHourLabel, endOfLocalDayUtc } from "./local-day"
```

```typescript
describe("endOfLocalDayUtc", () => {
  it("returns 23:59:59.999 UTC unchanged when the timezone is UTC", () => {
    expect(endOfLocalDayUtc("2026-09-30", "UTC").toISOString()).toBe("2026-09-30T23:59:59.999Z")
  })

  it("pushes the instant into the next UTC day for a negative offset (EDT, UTC-4 in September)", () => {
    // Local 23:59:59.999 in New York (UTC-4 in September) is 03:59:59.999 UTC the next day.
    expect(endOfLocalDayUtc("2026-09-30", "America/New_York").toISOString()).toBe("2026-10-01T03:59:59.999Z")
  })

  it("pulls the instant earlier in the same UTC day for a positive offset (JST, UTC+9)", () => {
    expect(endOfLocalDayUtc("2026-09-30", "Asia/Tokyo").toISOString()).toBe("2026-09-30T14:59:59.999Z")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run local-day`
Expected: FAIL — `endOfLocalDayUtc is not exported` / `is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `apps/web/lib/local-day.ts`:

```typescript
/**
 * The UTC instant for 23:59:59.999 local wall-clock time, on the given
 * calendar day, in the given IANA timezone. Use this to bound a date-range
 * window's end so "the last day of the period" means that day's close in the
 * venue's own timezone, not UTC's - forcing UTC end-of-day silently excludes
 * a venue's late-evening local hours for any negative-offset timezone.
 */
export function endOfLocalDayUtc(dateStr: string, timeZone: string): Date {
  const guess = new Date(`${dateStr}T23:59:59.999Z`)
  // Both re-parsed with the same (arbitrary) local-machine offset, so that
  // offset cancels out of the difference below regardless of server timezone.
  const asIfUtc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }))
  const asIfZoned = new Date(guess.toLocaleString("en-US", { timeZone }))
  const offsetMs = asIfZoned.getTime() - asIfUtc.getTime()
  return new Date(guess.getTime() - offsetMs)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run local-day`
Expected: PASS (all tests in `local-day.test.ts`, old and new)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/local-day.ts apps/web/lib/local-day.test.ts
git commit -m "$(cat <<'EOF'
Add endOfLocalDayUtc: venue-timezone-aware window end

A date-range window's end was forced to UTC 23:59:59.999 regardless of the
venue's own timezone, so a venue at a negative UTC offset could have shifts
that ended late in its local evening silently fall outside the window. Not
yet wired into any caller - that's part of the next two tasks.
EOF
)"
```

---

### Task 3: Fix `generate/route.ts` (single-member)

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/payroll/generate/route.ts`

- [ ] **Step 1: Update imports**

Replace:

```typescript
import {
  listShiftsChunked,
  listPositions,
  listPayrollChunked,
  createPayrollEntry,
  type ShiftRow,
  type PositionRow,
} from "@/lib/api/xvm-api"
import { dollarsToMinorUnits, minorUnitsToDollars, hoursToMinutes, minutesToHours } from "@/lib/api/position-convert"
```

with:

```typescript
import {
  listShiftsChunked,
  listPositions,
  listPayrollChunked,
  createPayrollEntry,
  getVenue,
  type ShiftRow,
} from "@/lib/api/xvm-api"
import { dollarsToMinorUnits, minorUnitsToDollars, minutesToHours } from "@/lib/api/position-convert"
import { endOfLocalDayUtc } from "@/lib/local-day"
import {
  resolveShiftRate,
  isShiftCovered,
  groupByRate,
  groupPeriod,
  totalMinutesWorked,
  hourlyAmountMinor,
  type ResolvedShift,
  type PositionRate,
} from "@/lib/payroll-generate"
```

(`PositionRow` drops out - only used locally for `positionById`, now typed via the shared `PositionRate`. `hoursToMinutes` drops out - entries are created from `totalMinutesWorked` directly now, no hours round-trip.)

- [ ] **Step 2: Remove the local `ResolvedShift` interface, `groupByRate`, and `groupPeriod`**

Delete:

```typescript
interface ResolvedShift {
  shift: ShiftRow
  hours: number
  rateMinorPerHour: number | null
}
```

and delete the `groupByRate` and `groupPeriod` function definitions (lines 104-125 in the original file) - both now come from `@/lib/payroll-generate`.

- [ ] **Step 3: Fix `findEligibleShifts` - double-pay window (finding 1) and timezone (finding 4)**

Replace the whole function:

```typescript
async function findEligibleShifts(
  token: string,
  xvmApiVenueId: string,
  membershipId: number,
  from: string,
  to: string,
  timeZone: string
): Promise<ShiftRow[]> {
  const fromIso = new Date(from).toISOString()
  const toIso = endOfLocalDayUtc(to, timeZone).toISOString()
  // Existing entries are fetched up to *now*, not just the requested window's
  // end: an entry's period_end can fall after the window it was generated for
  // (groupPeriod sets it to the group's own last shift time), so bounding this
  // query to the same window can miss a real covering entry and pay its
  // shifts a second time. Entries can only ever have a period_end in the past
  // (they're built from completed shifts), so "now" is always wide enough.
  const entriesToIso = new Date().toISOString()

  const [shifts, existingEntries] = await Promise.all([
    listShiftsChunked(token, xvmApiVenueId, { from: fromIso, to: toIso }),
    listPayrollChunked(token, xvmApiVenueId, { from: fromIso, to: entriesToIso, membershipId }),
  ])

  const completed = shifts.filter(
    (s) =>
      s.status === "completed" &&
      s.membership_id === membershipId &&
      s.actual_start !== null &&
      s.actual_end !== null
  )

  const entryWindows = existingEntries.map((e) => ({ periodStart: e.period_start, periodEnd: e.period_end }))
  return completed.filter((shift) => !isShiftCovered(new Date(shift.actual_end!).getTime(), entryWindows))
}
```

- [ ] **Step 4: Fix `resolveRates` and `summarize` to use the shared module**

Replace:

```typescript
async function resolveRates(token: string, xvmApiVenueId: string, shifts: ShiftRow[]): Promise<ResolvedShift[]> {
  const positions = await listPositions(token, xvmApiVenueId)
  const positionById = new Map<number, PositionRow>(positions.map((p) => [p.id, p]))

  return shifts.map((shift) => {
    const start = shift.actual_start ? new Date(shift.actual_start).getTime() : null
    const end = shift.actual_end ? new Date(shift.actual_end).getTime() : null
    const hours = start !== null && end !== null ? Math.round(((end - start) / (1000 * 60 * 60)) * 100) / 100 : 0

    const position = shift.position_id !== null ? positionById.get(shift.position_id) : undefined
    const rateMinorPerHour = position?.hourly_rate_minor ?? null

    return { shift, hours, rateMinorPerHour }
  })
}

function summarize(resolved: ResolvedShift[]) {
  const unresolved = resolved.filter((r) => r.rateMinorPerHour === null)
  const totalHours = resolved.reduce((sum, r) => sum + r.hours, 0)
  const totalAmountMinor = resolved.reduce((sum, r) => sum + Math.round(r.hours * (r.rateMinorPerHour ?? 0)), 0)
  return { unresolved, totalHours, totalAmountMinor }
}
```

with:

```typescript
async function resolveRates(token: string, xvmApiVenueId: string, shifts: ShiftRow[]): Promise<ResolvedShift[]> {
  const positions = await listPositions(token, xvmApiVenueId)
  const positionById = new Map<number, PositionRate>(
    positions.map((p) => [p.id, { id: p.id, hourlyRateMinor: p.hourly_rate_minor }])
  )

  return shifts.map((shift) =>
    resolveShiftRate(
      {
        id: shift.id,
        actualStart: shift.actual_start!,
        actualEnd: shift.actual_end!,
        minutesWorked: shift.worked_minutes ?? 0,
        positionId: shift.position_id,
      },
      positionById
    )
  )
}

function summarize(resolved: ResolvedShift[]) {
  const unresolved = resolved.filter((r) => r.rateMinorPerHour === null)
  const totalHours = resolved.reduce((sum, r) => sum + r.hours, 0)
  // Ceiling per rate-group over the group's total minutes, mirroring exactly
  // what the POST below actually creates - a per-shift sum here previously
  // showed a different total than the entries it was previewing.
  const groups = groupByRate(resolved.filter((r) => r.rateMinorPerHour !== null))
  const totalAmountMinor = [...groups.entries()].reduce(
    (sum, [rate, group]) => sum + hourlyAmountMinor(rate, totalMinutesWorked(group)),
    0
  )
  return { unresolved, totalHours, totalAmountMinor }
}
```

- [ ] **Step 5: Update the GET handler - id validation (finding 5), venue timezone, response mapping**

Replace:

```typescript
    const sp = request.nextUrl.searchParams
    const membershipIdParam = sp.get("membershipId")
    const periodStart = sp.get("periodStart")
    const periodEnd = sp.get("periodEnd")
    if (!membershipIdParam || !periodStart || !periodEnd) {
      return NextResponse.json({ error: "membershipId, periodStart, and periodEnd are required" }, { status: 400 })
    }
    const membershipId = Number(membershipIdParam)

    try {
      const eligible = await findEligibleShifts(token, gate.xvmApiVenueId!, membershipId, periodStart, periodEnd)
      const resolved = await resolveRates(token, gate.xvmApiVenueId!, eligible)
      const { unresolved, totalHours, totalAmountMinor } = summarize(resolved)
      const entryCount = groupByRate(resolved.filter((r) => r.rateMinorPerHour !== null)).size

      return NextResponse.json({
        shifts: resolved.map((r) => ({
          id: r.shift.id,
          actualStart: r.shift.actual_start,
          actualEnd: r.shift.actual_end,
          hoursWorked: r.hours,
          resolvedRate: r.rateMinorPerHour !== null ? minorUnitsToDollars(r.rateMinorPerHour) : null,
        })),
```

with:

```typescript
    const sp = request.nextUrl.searchParams
    const membershipIdParam = sp.get("membershipId")
    const periodStart = sp.get("periodStart")
    const periodEnd = sp.get("periodEnd")
    if (!membershipIdParam || !periodStart || !periodEnd) {
      return NextResponse.json({ error: "membershipId, periodStart, and periodEnd are required" }, { status: 400 })
    }
    const membershipId = Number(membershipIdParam)
    if (!Number.isInteger(membershipId) || membershipId <= 0) {
      return NextResponse.json({ error: "membershipId must be a positive integer" }, { status: 400 })
    }

    try {
      const venue = await getVenue(token, gate.xvmApiVenueId!)
      const eligible = await findEligibleShifts(
        token,
        gate.xvmApiVenueId!,
        membershipId,
        periodStart,
        periodEnd,
        venue.timezone
      )
      const resolved = await resolveRates(token, gate.xvmApiVenueId!, eligible)
      const { unresolved, totalHours, totalAmountMinor } = summarize(resolved)
      const entryCount = groupByRate(resolved.filter((r) => r.rateMinorPerHour !== null)).size

      return NextResponse.json({
        shifts: resolved.map((r) => ({
          id: r.shift.id,
          actualStart: r.shift.actualStart,
          actualEnd: r.shift.actualEnd,
          hoursWorked: r.hours,
          resolvedRate: r.rateMinorPerHour !== null ? minorUnitsToDollars(r.rateMinorPerHour) : null,
        })),
```

(the rest of the GET handler's returned JSON is unchanged.)

- [ ] **Step 6: Update the POST handler - venue timezone, direct minutes, partial-failure reporting (finding 6)**

Replace:

```typescript
    try {
      const eligible = await findEligibleShifts(
        token,
        gate.xvmApiVenueId!,
        data.membershipId,
        data.periodStart,
        data.periodEnd
      )
      if (eligible.length === 0) {
        return NextResponse.json({ error: "No unpaid completed shifts found in this period" }, { status: 400 })
      }

      const resolved = await resolveRates(token, gate.xvmApiVenueId!, eligible)
      const { unresolved } = summarize(resolved)

      if (unresolved.length > 0) {
        return NextResponse.json(
          {
            error: "Some shifts in this period have no resolvable rate",
            unresolvedShiftIds: unresolved.map((r) => r.shift.id),
          },
          { status: 409 }
        )
      }

      const groups = [...groupByRate(resolved).entries()]
      const bonusGroupIndex = groups.reduce((bestIndex, [, shifts], index) => {
        const bestHours = groups[bestIndex][1].reduce((sum, r) => sum + r.hours, 0)
        const hours = shifts.reduce((sum, r) => sum + r.hours, 0)
        return hours > bestHours ? index : bestIndex
      }, 0)

      const entries = await Promise.all(
        groups.map(async ([rateMinorPerHour, shifts], index) => {
          const groupHours = shifts.reduce((sum, r) => sum + r.hours, 0)
          const { start, end } = groupPeriod(shifts)
          const row = await createPayrollEntry(token, gate.xvmApiVenueId!, {
            membership_id: data.membershipId,
            payment_type: "hourly",
            base_rate_minor: rateMinorPerHour,
            minutes_worked: hoursToMinutes(groupHours)!,
            bonus_amount_minor:
              index === bonusGroupIndex && data.bonusAmount !== undefined
                ? (dollarsToMinorUnits(data.bonusAmount) ?? undefined)
                : undefined,
            period_start: start,
            period_end: end,
            notes: data.notes,
          })
          return {
            id: row.id,
            totalAmount: minorUnitsToDollars(row.total_amount_minor),
            hoursWorked: minutesToHours(row.minutes_worked),
          }
        })
      )

      return NextResponse.json({ entries, shiftsLinked: eligible.length }, { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[payroll/generate] POST error")
    }
```

with:

```typescript
    try {
      const venue = await getVenue(token, gate.xvmApiVenueId!)
      const eligible = await findEligibleShifts(
        token,
        gate.xvmApiVenueId!,
        data.membershipId,
        data.periodStart,
        data.periodEnd,
        venue.timezone
      )
      if (eligible.length === 0) {
        return NextResponse.json({ error: "No unpaid completed shifts found in this period" }, { status: 400 })
      }

      const resolved = await resolveRates(token, gate.xvmApiVenueId!, eligible)
      const { unresolved } = summarize(resolved)

      if (unresolved.length > 0) {
        return NextResponse.json(
          {
            error: "Some shifts in this period have no resolvable rate",
            unresolvedShiftIds: unresolved.map((r) => r.shift.id),
          },
          { status: 409 }
        )
      }

      const groups = [...groupByRate(resolved).entries()]
      const bonusGroupIndex = groups.reduce((bestIndex, [, shifts], index) => {
        const bestHours = groups[bestIndex][1].reduce((sum, r) => sum + r.hours, 0)
        const hours = shifts.reduce((sum, r) => sum + r.hours, 0)
        return hours > bestHours ? index : bestIndex
      }, 0)

      const settled = await Promise.allSettled(
        groups.map(async ([rateMinorPerHour, shifts], index) => {
          const minutesWorked = totalMinutesWorked(shifts)
          const { start, end } = groupPeriod(shifts)
          const row = await createPayrollEntry(token, gate.xvmApiVenueId!, {
            membership_id: data.membershipId,
            payment_type: "hourly",
            base_rate_minor: rateMinorPerHour,
            minutes_worked: minutesWorked,
            bonus_amount_minor:
              index === bonusGroupIndex && data.bonusAmount !== undefined
                ? (dollarsToMinorUnits(data.bonusAmount) ?? undefined)
                : undefined,
            period_start: start,
            period_end: end,
            notes: data.notes,
          })
          return {
            id: row.id,
            totalAmount: minorUnitsToDollars(row.total_amount_minor),
            hoursWorked: minutesToHours(row.minutes_worked),
          }
        })
      )

      // If a later group's create call fails after an earlier one already
      // committed, that entry is real and should not be reported as if
      // nothing happened - list what succeeded and what didn't rather than
      // throwing a generic error that hides the partial success.
      const entries: { id: number; totalAmount: number | null; hoursWorked: number | null }[] = []
      const failedGroups: { rateMinorPerHour: number; error: string }[] = []
      settled.forEach((result, index) => {
        if (result.status === "fulfilled") {
          entries.push(result.value)
        } else {
          failedGroups.push({
            rateMinorPerHour: groups[index][0],
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          })
        }
      })

      if (entries.length === 0 && failedGroups.length > 0) {
        return NextResponse.json({ error: "Payroll generation failed", failedGroups }, { status: 502 })
      }

      return NextResponse.json({ entries, shiftsLinked: eligible.length, failedGroups }, { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[payroll/generate] POST error")
    }
```

- [ ] **Step 7: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors from `app/api/venues/[venueId]/payroll/generate/route.ts`.

- [ ] **Step 8: Commit**

```bash
git add "apps/web/app/api/venues/[venueId]/payroll/generate/route.ts"
git commit -m "$(cat <<'EOF'
Fix payroll generate: double-pay window, precision, timezone, validation

Fixes every finding from the PR #55 review on the single-member generate
route:

- The existing-entries check now fetches up to now, not just the requested
  window - an entry's period_end can fall after the window it was generated
  for, so bounding that query to the same window could miss a real covering
  entry and pay its shifts a second time.
- Shift minutes come from xvm-api's own worked_minutes, not a recomputed
  and rounded hours value multiplied back - removes a precision-losing
  round-trip.
- The GET preview totals now use the same per-rate-group ceiling formula
  the POST actually creates entries with, instead of a per-shift rounded
  sum that could show a different total than what gets created.
- The window's end respects the venue's own timezone instead of being
  forced to UTC end-of-day.
- membershipId is validated as a positive integer instead of silently
  becoming NaN and returning an empty result for a bad id.
- A rate-group entry-creation failure after an earlier group's entry
  already committed now reports which entries succeeded and which failed,
  instead of a generic error that hides the partial success.
EOF
)"
```

---

### Task 4: Fix `generate-all/route.ts` (all-members)

**Files:**
- Modify: `apps/web/app/api/venues/[venueId]/payroll/generate-all/route.ts`

- [ ] **Step 1: Update imports**

Replace:

```typescript
import {
  listMemberships,
  listShiftsChunked,
  listPositions,
  listPayrollChunked,
  createPayrollEntry,
  type ShiftRow,
  type PositionRow,
  type MembershipRow,
} from "@/lib/api/xvm-api"
import { minorUnitsToDollars, hoursToMinutes } from "@/lib/api/position-convert"
```

with:

```typescript
import {
  listMemberships,
  listShiftsChunked,
  listPositions,
  listPayrollChunked,
  createPayrollEntry,
  getVenue,
  type MembershipRow,
} from "@/lib/api/xvm-api"
import { minorUnitsToDollars } from "@/lib/api/position-convert"
import { endOfLocalDayUtc } from "@/lib/local-day"
import {
  resolveShiftRate,
  isShiftCovered,
  groupByRate,
  groupPeriod,
  totalMinutesWorked,
  hourlyAmountMinor,
  type ResolvedShift,
  type PositionRate,
} from "@/lib/payroll-generate"
```

- [ ] **Step 2: Remove the local `ResolvedShift` interface, `groupByRate`, and `groupPeriod`**

Delete the local `interface ResolvedShift { ... }`, `function groupByRate(...)`, and `function groupPeriod(...)` (lines 36-63 in the original file) - all now come from `@/lib/payroll-generate`.

- [ ] **Step 3: Fix `computeAllMembers` - double-pay window, timezone, and route through the shared math**

Replace the whole function:

```typescript
async function computeAllMembers(
  token: string,
  xvmApiVenueId: string,
  periodStart: string,
  periodEnd: string
): Promise<MemberResult[]> {
  const fromIso = new Date(periodStart).toISOString()
  const toDate = new Date(periodEnd)
  toDate.setUTCHours(23, 59, 59, 999)
  const toIso = toDate.toISOString()

  const [members, shifts, positions, existingEntries] = await Promise.all([
    listMemberships(token, xvmApiVenueId),
    listShiftsChunked(token, xvmApiVenueId, { from: fromIso, to: toIso }),
    listPositions(token, xvmApiVenueId),
    listPayrollChunked(token, xvmApiVenueId, { from: fromIso, to: toIso }),
  ])

  const positionById = new Map<number, PositionRow>(positions.map((p) => [p.id, p]))
  const completedShifts = shifts.filter(
    (s) => s.status === "completed" && s.actual_start !== null && s.actual_end !== null
  )

  return members.map((member) => {
    const entriesForMember = existingEntries.filter((e) => e.membership_id === member.id)
    const memberShifts = completedShifts.filter((s) => s.membership_id === member.id)

    const eligible = memberShifts.filter((shift) => {
      const shiftEnd = new Date(shift.actual_end!).getTime()
      return !entriesForMember.some((entry) => {
        const start = new Date(entry.period_start).getTime()
        const end = new Date(entry.period_end).getTime()
        return shiftEnd >= start && shiftEnd <= end
      })
    })

    if (eligible.length === 0) {
      return { member, resolved: [], totalHours: 0, totalAmountMinor: 0, skipped: true, skipReason: "no_shifts" }
    }

    const resolved: ResolvedShift[] = eligible.map((shift) => {
      const start = new Date(shift.actual_start!).getTime()
      const end = new Date(shift.actual_end!).getTime()
      const hours = Math.round(((end - start) / (1000 * 60 * 60)) * 100) / 100
      const position = shift.position_id !== null ? positionById.get(shift.position_id) : undefined
      const rateMinorPerHour = position?.hourly_rate_minor ?? null
      return { shift, hours, rateMinorPerHour }
    })

    const anyUnresolved = resolved.some((r) => r.rateMinorPerHour === null)
    if (anyUnresolved) {
      return { member, resolved: [], totalHours: 0, totalAmountMinor: 0, skipped: true, skipReason: "unresolved_rate" }
    }

    const totalHours = resolved.reduce((sum, r) => sum + r.hours, 0)
    const totalAmountMinor = resolved.reduce((sum, r) => sum + Math.round(r.hours * r.rateMinorPerHour!), 0)

    return { member, resolved, totalHours, totalAmountMinor, skipped: false, skipReason: null }
  })
}
```

with:

```typescript
async function computeAllMembers(
  token: string,
  xvmApiVenueId: string,
  periodStart: string,
  periodEnd: string,
  timeZone: string
): Promise<MemberResult[]> {
  const fromIso = new Date(periodStart).toISOString()
  const toIso = endOfLocalDayUtc(periodEnd, timeZone).toISOString()
  // See the identical comment in generate/route.ts's findEligibleShifts: an
  // entry's period_end can fall after the window it was generated for, so
  // this must be fetched up to now, not bounded to the requested window.
  const entriesToIso = new Date().toISOString()

  const [members, shifts, positions, existingEntries] = await Promise.all([
    listMemberships(token, xvmApiVenueId),
    listShiftsChunked(token, xvmApiVenueId, { from: fromIso, to: toIso }),
    listPositions(token, xvmApiVenueId),
    listPayrollChunked(token, xvmApiVenueId, { from: fromIso, to: entriesToIso }),
  ])

  const positionById = new Map<number, PositionRate>(
    positions.map((p) => [p.id, { id: p.id, hourlyRateMinor: p.hourly_rate_minor }])
  )
  const entryWindowsByMember = new Map<number | null, { periodStart: string; periodEnd: string }[]>()
  for (const e of existingEntries) {
    const list = entryWindowsByMember.get(e.membership_id)
    const window = { periodStart: e.period_start, periodEnd: e.period_end }
    if (list) {
      list.push(window)
    } else {
      entryWindowsByMember.set(e.membership_id, [window])
    }
  }
  const completedShifts = shifts.filter(
    (s) => s.status === "completed" && s.actual_start !== null && s.actual_end !== null
  )

  return members.map((member) => {
    const entriesForMember = entryWindowsByMember.get(member.id) ?? []
    const memberShifts = completedShifts.filter((s) => s.membership_id === member.id)

    const eligible = memberShifts.filter(
      (shift) => !isShiftCovered(new Date(shift.actual_end!).getTime(), entriesForMember)
    )

    if (eligible.length === 0) {
      return { member, resolved: [], totalHours: 0, totalAmountMinor: 0, skipped: true, skipReason: "no_shifts" }
    }

    const resolved: ResolvedShift[] = eligible.map((shift) =>
      resolveShiftRate(
        {
          id: shift.id,
          actualStart: shift.actual_start!,
          actualEnd: shift.actual_end!,
          minutesWorked: shift.worked_minutes ?? 0,
          positionId: shift.position_id,
        },
        positionById
      )
    )

    const anyUnresolved = resolved.some((r) => r.rateMinorPerHour === null)
    if (anyUnresolved) {
      return { member, resolved: [], totalHours: 0, totalAmountMinor: 0, skipped: true, skipReason: "unresolved_rate" }
    }

    const totalHours = resolved.reduce((sum, r) => sum + r.hours, 0)
    const groups = groupByRate(resolved)
    const totalAmountMinor = [...groups.entries()].reduce(
      (sum, [rate, group]) => sum + hourlyAmountMinor(rate, totalMinutesWorked(group)),
      0
    )

    return { member, resolved, totalHours, totalAmountMinor, skipped: false, skipReason: null }
  })
}
```

- [ ] **Step 4: Update the GET handler to fetch the venue and pass its timezone**

Replace:

```typescript
    try {
      const results = await computeAllMembers(token, gate.xvmApiVenueId!, periodStart, periodEnd)
```

with:

```typescript
    try {
      const venue = await getVenue(token, gate.xvmApiVenueId!)
      const results = await computeAllMembers(token, gate.xvmApiVenueId!, periodStart, periodEnd, venue.timezone)
```

- [ ] **Step 5: Update the POST handler - venue timezone and direct minutes**

Replace:

```typescript
    try {
      const results = await computeAllMembers(token, gate.xvmApiVenueId!, data.periodStart, data.periodEnd)
      const eligible = results.filter((r) => !r.skipped)

      if (eligible.length === 0) {
        return NextResponse.json({ error: "No eligible members with shifts and rates in this period" }, { status: 400 })
      }

      const perMemberEntries = await Promise.all(
        eligible.map(async (r) => {
          const groups = [...groupByRate(r.resolved).entries()]
          const createdTotalsMinor = await Promise.all(
            groups.map(async ([rateMinorPerHour, shifts]) => {
              const groupHours = shifts.reduce((sum, s) => sum + s.hours, 0)
              const { start, end } = groupPeriod(shifts)
              const row = await createPayrollEntry(token, gate.xvmApiVenueId!, {
                membership_id: r.member.id,
                payment_type: "hourly",
                base_rate_minor: rateMinorPerHour,
                minutes_worked: hoursToMinutes(groupHours)!,
                period_start: start,
                period_end: end,
              })
              return row.total_amount_minor
            })
          )
```

with:

```typescript
    try {
      const venue = await getVenue(token, gate.xvmApiVenueId!)
      const results = await computeAllMembers(
        token,
        gate.xvmApiVenueId!,
        data.periodStart,
        data.periodEnd,
        venue.timezone
      )
      const eligible = results.filter((r) => !r.skipped)

      if (eligible.length === 0) {
        return NextResponse.json({ error: "No eligible members with shifts and rates in this period" }, { status: 400 })
      }

      const perMemberEntries = await Promise.all(
        eligible.map(async (r) => {
          const groups = [...groupByRate(r.resolved).entries()]
          const createdTotalsMinor = await Promise.all(
            groups.map(async ([rateMinorPerHour, shifts]) => {
              const minutesWorked = totalMinutesWorked(shifts)
              const { start, end } = groupPeriod(shifts)
              const row = await createPayrollEntry(token, gate.xvmApiVenueId!, {
                membership_id: r.member.id,
                payment_type: "hourly",
                base_rate_minor: rateMinorPerHour,
                minutes_worked: minutesWorked,
                period_start: start,
                period_end: end,
              })
              return row.total_amount_minor
            })
          )
```

(the rest of the POST handler - the `return { membershipId: ... }` block and the final `NextResponse.json` - is unchanged.)

- [ ] **Step 6: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors from `app/api/venues/[venueId]/payroll/generate-all/route.ts`.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/api/venues/[venueId]/payroll/generate-all/route.ts"
git commit -m "$(cat <<'EOF'
Fix payroll generate-all: same double-pay window and timezone bugs

Mirrors the generate/route.ts fix: the existing-entries check now fetches
up to now instead of bounding to the requested window (an entry's
period_end can fall after the window it was generated for), and the
window's end respects the venue's own timezone instead of forcing UTC
end-of-day. Also routes through the same shared payroll-generate module as
generate/route.ts, which fixes the identical precision-loss and per-shift
rounding bugs this file had independently re-implemented.
EOF
)"
```

---

### Task 5: Full verification

- [ ] **Step 1: Run the full test suite**

Run: `cd apps/web && npx vitest run`
Expected: all tests pass, including the new `payroll-generate.test.ts` and the extended `local-day.test.ts`.

- [ ] **Step 2: Full type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Live check against local dev**

Per `CLAUDE.md`: static checks alone aren't enough for this project. Start the local stack (`docker-compose.local.yml` + `pnpm dev` at `localhost:3000`, per `docs/LOCAL_DEV.md`), and click through:

1. Open a venue's payroll page, single-member "Generate" flow: pick a member and a period with completed shifts spanning a rate change or crossing a month boundary if test data allows; confirm the preview total matches the total on the created entry (not just visually close - findings 2/3 were exact-cent bugs).
2. Generate for an overlapping period a second time; confirm the already-paid shifts do NOT appear as eligible again (finding 1 - this is the one to check most carefully, it's the blocking finding).
3. Repeat both checks via "Generate All".
4. Confirm a bad `membershipId` query param (e.g. `?membershipId=abc`) on the GET preview returns 400, not an empty shift list.

- [ ] **Step 4: Push and request re-review**

```bash
git push origin feat/payroll-cutover
gh pr comment 55 --repo xiv-venue-manager/xvm-dashboard --body "Pushed fixes for all six findings - see the four commits on this branch for how each was addressed. Re-requesting review."
gh pr edit 55 --repo xiv-venue-manager/xvm-dashboard --add-reviewer AllegroVivo
```

(Confirm with the user before pushing/commenting/re-requesting - these are visible, shared-repo actions.)
