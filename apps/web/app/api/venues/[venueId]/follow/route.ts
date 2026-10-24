import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { followVenue, unfollowVenue } from "@/lib/api/xvm-api"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"

async function getXvmApiVenueId(venueId: string) {
  return prisma.venue.findFirst({
    where: { OR: [{ id: venueId }, { slug: venueId }], isActive: true },
    select: { xvmApiVenueId: true },
  })
}

async function setFollowing(params: Promise<{ venueId: string }>, following: boolean) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { venueId } = await params
  const venue = await getXvmApiVenueId(venueId)
  if (!venue) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!venue.xvmApiVenueId) {
    return NextResponse.json(
      { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
      { status: 409 }
    )
  }

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

  try {
    if (following) await followVenue(token, venue.xvmApiVenueId)
    else await unfollowVenue(token, venue.xvmApiVenueId)
    return NextResponse.json({ following })
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, `[venue follow ${following ? "POST" : "DELETE"}] xvm-api error`)
  }
}

export async function POST(_req: Request, { params }: { params: Promise<{ venueId: string }> }) {
  return setFollowing(params, true)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ venueId: string }> }) {
  return setFollowing(params, false)
}
