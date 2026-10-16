import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { requireMyVenueRole } from "@/lib/api/venue-access"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listServices, createService } from "@/lib/api/xvm-api"
import { gilToMinorUnits } from "@/lib/api/position-convert"
import { validators } from "@/lib/validation"

const createServiceSchema = z.object({
  name: validators.serviceName,
  description: validators.serviceDescription,
  price: z.number().min(0, "Price must be positive"),
  categoryId: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().default(true),
}).strict()

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId } = await context.params
    const lookup = await requireMyVenueRole(session.user.id, venueId, "STAFF", "You don't have access to this venue", "[services] /me/venues read error")
    if (!lookup.ok) return lookup.response

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    try {
      const services = await listServices(token, lookup.venue.id)
      return NextResponse.json(services)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[services] GET error")
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
    const lookup = await requireMyVenueRole(session.user.id, venueId, "MANAGER", "You don't have permission to create services", "[services] /me/venues read error")
    if (!lookup.ok) return lookup.response

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    let data: z.infer<typeof createServiceSchema>
    try {
      data = createServiceSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const service = await createService(token, lookup.venue.id, {
        name: data.name,
        description: data.description,
        price_minor: gilToMinorUnits(data.price),
        category_id: data.categoryId ?? null,
        is_active: data.isActive,
      })
      return NextResponse.json(service, { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[services] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)
