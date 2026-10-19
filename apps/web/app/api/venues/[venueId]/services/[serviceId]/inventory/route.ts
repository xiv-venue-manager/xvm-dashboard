import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { requireMyVenueRole } from "@/lib/api/venue-access"
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

export const PUT = withRateLimit<{ params: Promise<{ venueId: string; serviceId: string }> }>(
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId, serviceId } = await context.params
    const lookup = await requireMyVenueRole(session.user.id, venueId, "MANAGER", "You don't have permission to manage service inventory", "[service inventory] /me/venues read error")
    if (!lookup.ok) return lookup.response

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

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
      const inventory = await linkServiceInventory(token, lookup.venue.id, Number(serviceId), {
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
    const lookup = await requireMyVenueRole(session.user.id, venueId, "MANAGER", "You don't have permission to manage service inventory", "[service inventory] /me/venues read error")
    if (!lookup.ok) return lookup.response

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    try {
      await unlinkServiceInventory(token, lookup.venue.id, Number(serviceId))
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[services/[serviceId]/inventory] DELETE error")
    }
  },
  { requests: 20, window: "1 m" }
)
