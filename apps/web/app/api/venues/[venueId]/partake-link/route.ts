import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue, requireMyVenueRole } from "@/lib/api/venue-access"
import { getVenue, linkVenueExternal, unlinkVenueExternal } from "@/lib/api/xvm-api"

const PROVIDER = "Partake"

const putSchema = z.object({ teamId: z.number().int().positive().nullable() })

type Params = { params: Promise<{ venueId: string }> }

async function liveLink(token: string, xvmVenueId: string) {
  const detail = await getVenue(token, xvmVenueId)
  return detail.external_links.find((link) => link.provider === PROVIDER && link.unlinked_at === null) ?? null
}

export const GET = withRateLimit<Params>(
  async (_request: NextRequest, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { venueId } = await context.params
    const lookup = await requireMyVenue(session.user.id, venueId, "[partake-link] /me/venues read error")
    if (!lookup.ok) return lookup.response

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    try {
      const link = await liveLink(token, lookup.venue.id)
      return NextResponse.json({ teamId: link ? Number(link.external_id) : null })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[partake-link] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const PUT = withRateLimit<Params>(
  async (request: NextRequest, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { venueId } = await context.params
    const lookup = await requireMyVenueRole(
      session.user.id,
      venueId,
      "OWNER",
      "Only venue owners can update settings",
      "[partake-link] /me/venues read error"
    )
    if (!lookup.ok) return lookup.response

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const parsed = putSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 })
    }
    const { teamId } = parsed.data

    try {
      const current = await liveLink(token, lookup.venue.id)
      if (current && teamId !== null && current.external_id === String(teamId)) {
        return NextResponse.json({ teamId })
      }
      if (current) await unlinkVenueExternal(token, lookup.venue.id, current.id)
      if (teamId !== null) {
        await linkVenueExternal(token, lookup.venue.id, { provider: PROVIDER, external_id: String(teamId) })
      }
      return NextResponse.json({ teamId })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[partake-link] PUT error")
    }
  },
  { requests: 20, window: "1 m" }
)
