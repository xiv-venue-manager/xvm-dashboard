import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { followVenue, unfollowVenue } from "@/lib/api/xvm-api"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"

async function setFollowing(params: Promise<{ venueId: string }>, following: boolean) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { venueId } = await params
  const token = await getValidXvmApiToken(session.user.id)
  if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

  try {
    if (following) await followVenue(token, venueId)
    else await unfollowVenue(token, venueId)
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
