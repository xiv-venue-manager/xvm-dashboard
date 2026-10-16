import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { requireMyVenueRole } from "@/lib/api/venue-access"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { updateServiceCategory, deleteServiceCategory } from "@/lib/api/xvm-api"

const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(50).optional(),
    sort_order: z.number().int().min(0).optional(),
  })
  .strict()

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; categoryId: string }> }>(
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId, categoryId } = await context.params
    const categoryIdNum = Number(categoryId)
    if (!Number.isInteger(categoryIdNum) || categoryIdNum <= 0) {
      return NextResponse.json({ error: "Invalid category id" }, { status: 400 })
    }

    const lookup = await requireMyVenueRole(session.user.id, venueId, "MANAGER", "You don't have permission to manage categories", "[service categories] /me/venues read error")
    if (!lookup.ok) return lookup.response

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    let data: z.infer<typeof updateCategorySchema>
    try {
      data = updateCategorySchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const category = await updateServiceCategory(token, lookup.venue.id, categoryIdNum, data)
      return NextResponse.json(category)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[services/categories] PATCH error")
    }
  },
  { requests: 20, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; categoryId: string }> }>(
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId, categoryId } = await context.params
    const categoryIdNum = Number(categoryId)
    if (!Number.isInteger(categoryIdNum) || categoryIdNum <= 0) {
      return NextResponse.json({ error: "Invalid category id" }, { status: 400 })
    }

    const lookup = await requireMyVenueRole(session.user.id, venueId, "OWNER", "Only owners can delete categories", "[service categories] /me/venues read error")
    if (!lookup.ok) return lookup.response

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    try {
      await deleteServiceCategory(token, lookup.venue.id, categoryIdNum)
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[services/categories] DELETE error")
    }
  },
  { requests: 5, window: "1 m" }
)
