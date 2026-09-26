import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getValidXvmApiToken } from "@/lib/api/xvm-api-store"

export async function pluginXvmContext(
  userId: string,
  venueId: string
): Promise<{ token: string; xvmApiVenueId: string } | { error: NextResponse }> {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }

  const token = await getValidXvmApiToken(userId)
  if (!token) {
    return {
      error: NextResponse.json(
        { error: "xvm-api link expired. Sign in to the dashboard again to refresh it." },
        { status: 503 }
      ),
    }
  }

  return { token, xvmApiVenueId: venue.xvmApiVenueId }
}
