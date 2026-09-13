import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
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

export const GET = withRateLimit<{ params: Promise<{ venueId: string; serviceId: string }> }>(
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId, serviceId } = await context.params
    const membership = await prisma.membership.findFirst({
      where: { userId: session.user.id, venueId, status: "active" },
    })
    if (!membership) {
      return NextResponse.json({ error: "You don't have access to this venue" }, { status: 403 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      const movements = await listStockMovements(token, gate.xvmApiVenueId!, Number(serviceId))
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
    const membership = await prisma.membership.findFirst({
      where: { userId: session.user.id, venueId, status: "active" },
    })
    if (!membership || !["OWNER", "MANAGER"].includes(membership.role)) {
      return NextResponse.json({ error: "You don't have permission to manage service inventory" }, { status: 403 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

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
      const movement = await createStockMovement(token, gate.xvmApiVenueId!, Number(serviceId), data)
      return NextResponse.json(movement, { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[services/[serviceId]/inventory/movements] POST error")
    }
  },
  { requests: 20, window: "1 m" }
)
