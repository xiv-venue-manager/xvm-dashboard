import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { acceptInvite } from "@/lib/api/xvm-api"
import { resolveMyVenue } from "@/lib/api/venue-access"
import { invalidateCache, cacheKeys } from "@/lib/redis-cache"

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "You must be signed in to accept an invite" }, { status: 401 })
  }

  const { token } = await params

  const personToken = await getValidXvmApiToken(session.user.id)
  if (!personToken) {
    return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
  }

  try {
    const membership = await acceptInvite(personToken, token)

    await invalidateCache(cacheKeys.userVenues(session.user.id))

    const venue = await resolveMyVenue(session.user.id, membership.venue_id).catch((e) => {
      console.warn("[invites/accept] venue lookup failed", e)
      return null
    })

    return NextResponse.json({
      success: true,
      membership: { id: membership.id, role: membership.tier.toUpperCase() },
      venue: venue ? { name: venue.name, slug: venue.slug } : null,
    })
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, "[invites/accept] POST error")
  }
}
