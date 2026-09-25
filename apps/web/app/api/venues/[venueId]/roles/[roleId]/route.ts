import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listPositions, updatePosition, deletePosition, type PositionRow } from "@/lib/api/xvm-api"
import { hexColorToInt, intColorToHex, gilToMinorUnits, minorUnitsToGil } from "@/lib/api/position-convert"
import { validators } from "@/lib/validation"

const updateRoleSchema = z.object({
  name: validators.roleName.optional(),
  responsibilities: validators.roleDescription,
  color: z.string().optional(),
  hourlyRate: z.number().positive().nullable().optional(),
})

function toRoleShape(position: PositionRow) {
  return {
    id: position.id,
    name: position.name,
    color: intColorToHex(position.color),
    responsibilities: position.responsibilities,
    hourlyRate: minorUnitsToGil(position.hourly_rate_minor),
    potPayoutMode: position.pot_payout_mode,
    contractorSharesPot: position.contractor_shares_pot,
    permissions: null,
    _count: { memberships: position.member_ids.length },
  }
}

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId }
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string; roleId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, roleId } = await context.params
    const positionId = Number(roleId)
    if (!Number.isInteger(positionId)) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      const positions = await listPositions(token, gate.xvmApiVenueId!)
      const position = positions.find((p) => p.id === positionId)
      if (!position) {
        return NextResponse.json({ error: "Role not found" }, { status: 404 })
      }
      return NextResponse.json(toRoleShape(position))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[roles] GET one error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const PUT = withRateLimit<{ params: Promise<{ venueId: string; roleId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, roleId } = await context.params
    const positionId = Number(roleId)
    if (!Number.isInteger(positionId)) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof updateRoleSchema>
    try {
      data = updateRoleSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    let color: number | null | undefined
    try {
      color = data.color !== undefined ? (data.color ? hexColorToInt(data.color) : null) : undefined
    } catch {
      return NextResponse.json({ error: "Invalid color format" }, { status: 400 })
    }

    try {
      const position = await updatePosition(token, gate.xvmApiVenueId!, positionId, {
        name: data.name,
        color,
        responsibilities: data.responsibilities,
        hourly_rate_minor: data.hourlyRate !== undefined ? gilToMinorUnits(data.hourlyRate) : undefined,
      })
      return NextResponse.json(toRoleShape(position))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[roles] PUT error")
    }
  },
  { requests: 20, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; roleId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, roleId } = await context.params
    const positionId = Number(roleId)
    if (!Number.isInteger(positionId)) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      const positions = await listPositions(token, gate.xvmApiVenueId!)
      const position = positions.find((p) => p.id === positionId)
      if (!position) {
        return NextResponse.json({ error: "Role not found" }, { status: 404 })
      }
      if (position.member_ids.length > 0) {
        return NextResponse.json(
          { error: `Cannot delete role. It is assigned to ${position.member_ids.length} staff member(s)` },
          { status: 400 }
        )
      }

      await deletePosition(token, gate.xvmApiVenueId!, positionId)
      return NextResponse.json({ success: true })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[roles] DELETE error")
    }
  },
  { requests: 5, window: "1 m" }
)
