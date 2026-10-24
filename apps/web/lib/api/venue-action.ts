import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"

export function parseId(raw: string): number | null {
  if (!/^[1-9]\d*$/.test(raw)) return null
  const id = Number(raw)
  return Number.isSafeInteger(id) ? id : null
}

export async function withVenueAction(
  venueSlug: string,
  label: string,
  run: (token: string, xvmApiVenueId: string) => Promise<NextResponse>
): Promise<NextResponse> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) {
    return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
  }

  const lookup = await requireMyVenue(session.user.id, venueSlug, `[${label}] /me/venues read error`)
  if (!lookup.ok) return lookup.response

  try {
    return await run(token, lookup.venue.id)
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, `[${label}] error`)
  }
}
