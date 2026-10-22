import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import {
  withdrawShift,
  approveShift,
  rejectShift,
  clockInShift,
  clockOutShift,
  type ShiftRow,
} from "@/lib/api/xvm-api"
import { z } from "zod"

const SHIFT_STATUS_SHAPE: Record<ShiftRow["status"], string> = {
  pending_approval: "CLAIMED",
  scheduled: "SCHEDULED",
  active: "ACTIVE",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
  missed: "MISSED",
}

function toShiftShape(shift: ShiftRow) {
  return {
    id: shift.id,
    membershipId: shift.membership_id,
    status: SHIFT_STATUS_SHAPE[shift.status],
    scheduledStart: shift.scheduled_start,
    scheduledEnd: shift.scheduled_end,
    actualStart: shift.actual_start,
    actualEnd: shift.actual_end,
    workedMinutes: shift.worked_minutes,
  }
}

const patchSchema = z.object({
  action: z.enum(["clock-in", "clock-out", "withdraw", "approve", "reject"]),
})

/**
 * PATCH /api/venues/[venueId]/shifts/[shiftId]
 * Withdraw/approve/reject/clock a seat. Tier requirements are enforced by xvm-api itself
 * (withdraw/clock-in/clock-out need a member; approve/reject need manager tier) - this route
 * just forwards the action and the resulting 403 if any.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ venueId: string; shiftId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) {
    return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
  }

  const { venueId, shiftId: shiftIdParam } = await params
  const shiftId = Number(shiftIdParam)
  if (!Number.isInteger(shiftId)) {
    return NextResponse.json({ error: "Shift not found" }, { status: 404 })
  }

  const lookup = await requireMyVenue(session.user.id, venueId, "[shifts/[shiftId]] /me/venues read error")
  if (!lookup.ok) return lookup.response

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  }

  try {
    let shift: ShiftRow
    switch (parsed.data.action) {
      case "withdraw":
        shift = await withdrawShift(token, lookup.venue.id, shiftId)
        break
      case "approve":
        shift = await approveShift(token, lookup.venue.id, shiftId)
        break
      case "reject":
        shift = await rejectShift(token, lookup.venue.id, shiftId)
        break
      case "clock-in":
        shift = await clockInShift(token, lookup.venue.id, shiftId)
        break
      case "clock-out":
        shift = await clockOutShift(token, lookup.venue.id, shiftId)
        break
    }
    return NextResponse.json({ success: true, shift: toShiftShape(shift) })
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, `[shifts] PATCH ${parsed.data.action} error`)
  }
}

/**
 * DELETE /api/venues/[venueId]/shifts/[shiftId]
 * xvm-api has no hard delete for seats, only an audited reject (same delete->cancel
 * mapping already used for Tasks) - this takes the person off the shift rather than removing the row.
 * Manager tier, enforced by xvm-api.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ venueId: string; shiftId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) {
    return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
  }

  const { venueId, shiftId: shiftIdParam } = await params
  const shiftId = Number(shiftIdParam)
  if (!Number.isInteger(shiftId)) {
    return NextResponse.json({ error: "Shift not found" }, { status: 404 })
  }

  const lookup = await requireMyVenue(session.user.id, venueId, "[shifts/[shiftId]] /me/venues read error")
  if (!lookup.ok) return lookup.response

  try {
    const shift = await rejectShift(token, lookup.venue.id, shiftId, null)
    return NextResponse.json({ success: true, shift: toShiftShape(shift) })
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, "[shifts] DELETE error")
  }
}
