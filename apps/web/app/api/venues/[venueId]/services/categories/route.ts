import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { requireMyVenueRole } from "@/lib/api/venue-access"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listServiceCategories, createServiceCategory } from "@/lib/api/xvm-api"

const createCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    sort_order: z.number().int().min(0).optional(),
  })
  .strict()

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId } = await context.params
    const lookup = await requireMyVenueRole(session.user.id, venueId, "STAFF", "You don't have access to this venue", "[service categories] /me/venues read error")
    if (!lookup.ok) return lookup.response

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    try {
      const categories = await listServiceCategories(token, lookup.venue.id)
      return NextResponse.json(categories)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[services/categories] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId } = await context.params
    const lookup = await requireMyVenueRole(session.user.id, venueId, "MANAGER", "You don't have permission to manage categories", "[service categories] /me/venues read error")
    if (!lookup.ok) return lookup.response

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    let data: z.infer<typeof createCategorySchema>
    try {
      data = createCategorySchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const category = await createServiceCategory(token, lookup.venue.id, data)
      return NextResponse.json(category, { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[services/categories] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)
