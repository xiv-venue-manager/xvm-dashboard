import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { requireMyVenueRole } from "@/lib/api/venue-access"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { getService, updateService, deleteService } from "@/lib/api/xvm-api"
import { gilToMinorUnits } from "@/lib/api/position-convert"
import { validators } from "@/lib/validation"

const updateServiceSchema = z.object({
  name: validators.serviceName.optional(),
  description: validators.serviceDescription,
  price: z.number().min(0).optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
}).strict()

export const GET = withRateLimit<{ params: Promise<{ venueId: string; serviceId: string }> }>(
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId, serviceId } = await context.params
    const lookup = await requireMyVenueRole(session.user.id, venueId, "STAFF", "You don't have access to this venue", "[services] /me/venues read error")
    if (!lookup.ok) return lookup.response

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    try {
      const service = await getService(token, lookup.venue.id, Number(serviceId))
      return NextResponse.json(service)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[services/[serviceId]] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; serviceId: string }> }>(
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId, serviceId } = await context.params
    const lookup = await requireMyVenueRole(session.user.id, venueId, "MANAGER", "You don't have permission to update services", "[services] /me/venues read error")
    if (!lookup.ok) return lookup.response

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    let data: z.infer<typeof updateServiceSchema>
    try {
      data = updateServiceSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const service = await updateService(token, lookup.venue.id, Number(serviceId), {
        name: data.name,
        description: data.description,
        price_minor: data.price !== undefined ? gilToMinorUnits(data.price) : undefined,
        category_id: data.categoryId,
        is_active: data.isActive,
      })
      return NextResponse.json(service)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[services/[serviceId]] PATCH error")
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
    const lookup = await requireMyVenueRole(session.user.id, venueId, "OWNER", "Only owners can delete services", "[services] /me/venues read error")
    if (!lookup.ok) return lookup.response

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    try {
      await deleteService(token, lookup.venue.id, Number(serviceId))
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[services/[serviceId]] DELETE error")
    }
  },
  { requests: 5, window: "1 m" }
)
