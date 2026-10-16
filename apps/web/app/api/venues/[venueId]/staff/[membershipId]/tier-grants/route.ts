import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { grantTier, listTierGrants } from "@/lib/api/xvm-api"

const grantSchema = z.object({
  expiresAt: z.string().datetime({ message: "expiresAt must be an ISO 8601 datetime" }),
})

export const GET = withRateLimit<{ params: Promise<{ venueId: string; membershipId: string }> }>(
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

    const { venueId, membershipId } = await context.params
    const id = Number(membershipId)
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[staff/tier-grants] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      const grants = await listTierGrants(token, lookup.venue.id, id)
      return NextResponse.json(grants)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[staff/tier-grants] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const POST = withRateLimit<{ params: Promise<{ venueId: string; membershipId: string }> }>(
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

    const { venueId, membershipId } = await context.params
    const id = Number(membershipId)
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[staff/tier-grants] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof grantSchema>
    try {
      data = grantSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: err.issues }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const grant = await grantTier(token, lookup.venue.id, id, data.expiresAt)
      return NextResponse.json(grant, { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[staff/tier-grants] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)
