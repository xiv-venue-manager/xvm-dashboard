// apps/web/lib/shift-format.ts

import { localDayKey, localHourLabel } from "./local-day"
import type { ShiftRow as ApiShiftRow, ShiftApiStatus } from "./api/xvm-api"

// FFXIV server time = UTC (see apps/web/app/dashboard/[slug]/shifts/page.tsx).
// These mirror that page's private utcDayKey/fmtHour helpers so the calendar
// and day-detail dialog group/label shifts identically to the week grid,
// regardless of the viewer's browser timezone.

/** "2026-07-31" in UTC, used as a day-bucket key. */
export function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** "10PM" or "10:30PM", read in UTC. */
export function fmtHour(iso: string | Date): string {
  const d = new Date(iso)
  const h = d.getUTCHours()
  const m = d.getUTCMinutes()
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = h % 12 || 12
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, "0")}${ampm}`
}

/** Local-timezone day key, or the UTC one if `mounted` is false (SSR/first paint). */
export function dayKeyFor(d: Date | string, timeZone: string | null): string {
  return timeZone ? localDayKey(d, timeZone) : utcDayKey(new Date(d))
}

/** Local-timezone hour label, or the UTC one if `mounted` is false (SSR/first paint). */
export function hourLabelFor(d: Date | string, timeZone: string | null): string {
  return timeZone ? localHourLabel(d, timeZone) : fmtHour(d)
}

export type ShiftUiStatus =
  | "OPEN"
  | "CLAIMED"
  | "SCHEDULED"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELLED"
  | "MISSED"
  | "UNFILLED"

export const SHIFT_STATUS_SHAPE: Record<ShiftApiStatus, ShiftUiStatus> = {
  pending_approval: "CLAIMED",
  scheduled: "SCHEDULED",
  active: "ACTIVE",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
  missed: "MISSED",
}

export const statusBadgeClass: Record<string, string> = {
  SCHEDULED: "bg-[rgba(0,180,255,0.12)] text-[var(--xiv-blue)] border-[rgba(0,180,255,0.35)]",
  ACTIVE: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  COMPLETED: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  MISSED: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  UNFILLED: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  CANCELLED: "bg-red-500/10 text-red-400 border-red-500/20",
}

// One membership/name lookup, built once per page render and threaded through
// props, so every row can resolve a name without its own network call.
export type StaffNameLookup = Map<number, string>

export interface ShiftRow {
  id: number
  membershipId: number | null
  roleId: number | null
  roleName: string | null
  payrollEntryId: number | null
  scheduledStart: string
  scheduledEnd: string
  status: ShiftUiStatus
  notes: string | null
}

export type CalendarShift = ShiftRow

export function toShiftRow(shift: ApiShiftRow, roleName: string | null): ShiftRow {
  return {
    id: shift.id,
    membershipId: shift.membership_id,
    roleId: shift.position_id,
    roleName,
    payrollEntryId: shift.payroll_entry_id,
    // An unscheduled shift only exists because somebody clocked in, so
    // actual_start covers scheduledStart's fallback for real. scheduledEnd's
    // fallback is different: an open-ended walk-in has no end at all, and
    // `new Date()` here would draw the block ending at render time - visibly
    // drifting on every request. Falling back to the resolved start instead
    // keeps it a stable zero-width block rather than one that grows every
    // render; the ideal fix (a nullable end rendered as "no end" through the
    // whole component chain) is a bigger ripple than this one function.
    scheduledStart: shift.scheduled_start ?? shift.actual_start ?? new Date().toISOString(),
    scheduledEnd: shift.scheduled_end ?? shift.actual_end ?? shift.scheduled_start ?? shift.actual_start ?? new Date().toISOString(),
    status: SHIFT_STATUS_SHAPE[shift.status],
    notes: shift.notes,
  }
}

// xvm-api's MembershipPerson only carries display_name - no FFXIV character
// name, no nickname layering like the old Prisma resolveDisplayName chain
// had. Ships with the Discord display name only; swap this one function once
// xvm-api exposes external_id on MembershipPerson and a character-name bridge
// exists (see docs/superpowers/plans/2026-09-01-shifts-page-xvm-api-cutover.md
// for the tracked ask).
export function staffNameOf(membershipId: number | null, names: StaffNameLookup): string {
  if (membershipId === null) return "Unassigned"
  return names.get(membershipId) ?? "Unknown"
}
