import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { requireMyVenueRole } from "@/lib/api/venue-access"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listStockMovements, createStockMovement } from "@/lib/api/xvm-api"

const createMovementSchema = z
  .object({
    reason: z.enum(["restock", "adjustment", "spoilage"]),
    delta: z.number().int(),
    note: z.string().nullable().optional(),
  })
  .strict()

export const GET = withRateLimit<{ params: Promise<{ venueId: string; serviceId: string }> }>(
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId, serviceId } = await context.params
    const lookup = await requireMyVenueRole(session.user.id, venueId, "STAFF", "You don't have access to this venue", "[stock movements] /me/venues read error")
    if (!lookup.ok) return lookup.response

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    try {
      const movements = await listStockMovements(token, lookup.venue.id, Number(serviceId))
      return NextResponse.json(movements)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[services/[serviceId]/inventory/movements] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string; serviceId: string }> }>(
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId, serviceId } = await context.params
    const lookup = await requireMyVenueRole(session.user.id, venueId, "MANAGER", "You don't have permission to manage service inventory", "[stock movements] /me/venues read error")
    if (!lookup.ok) return lookup.response

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    let data: z.infer<typeof createMovementSchema>
    try {
      data = createMovementSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const movement = await createStockMovement(token, lookup.venue.id, Number(serviceId), data)
      return NextResponse.json(movement, { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[services/[serviceId]/inventory/movements] POST error")
    }
  },
  { requests: 20, window: "1 m" }
)
