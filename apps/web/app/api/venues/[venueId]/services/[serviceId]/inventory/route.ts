import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { linkServiceInventory, unlinkServiceInventory } from "@/lib/api/xvm-api"

const linkInventorySchema = z
  .object({
    linkedItemId: z.number().int().positive(),
    linkedItemName: z.string().nullable().optional(),
    linkedItemIcon: z.number().int().nullable().optional(),
    lowStockThreshold: z.number().int().nullable().optional(),
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

export const PUT = withRateLimit<{ params: Promise<{ venueId: string; serviceId: string }> }>(
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

    let data: z.infer<typeof linkInventorySchema>
    try {
      data = linkInventorySchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const inventory = await linkServiceInventory(token, gate.xvmApiVenueId!, Number(serviceId), {
        linked_item_id: data.linkedItemId,
        linked_item_name: data.linkedItemName,
        linked_item_icon: data.linkedItemIcon,
        low_stock_threshold: data.lowStockThreshold,
      })
      return NextResponse.json(inventory)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[services/[serviceId]/inventory] PUT error")
    }
  },
  { requests: 20, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; serviceId: string }> }>(
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

    try {
      await unlinkServiceInventory(token, gate.xvmApiVenueId!, Number(serviceId))
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[services/[serviceId]/inventory] DELETE error")
    }
  },
  { requests: 20, window: "1 m" }
)
