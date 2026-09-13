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
 * entries generously (not bounded to the same window being generated for).
 */
export function isShiftCovered(shiftEndMs: number, entries: PayrollEntryWindow[]): boolean {
  return entries.some((entry) => {
    const start = new Date(entry.periodStart).getTime()
    const end = new Date(entry.periodEnd).getTime()
    return shiftEndMs >= start && shiftEndMs <= end
  })
}

// Callers must filter out null-rate shifts first: the assertion below is a
// TypeScript-only device, so a null rate slips through as a literal `null`
// map key that later arithmetic (e.g. hourlyAmountMinor) treats as 0 - a
// real $0/hr rate.
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
