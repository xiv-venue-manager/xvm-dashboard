import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { addProfileGalleryImage } from "@/lib/api/xvm-api"

function parseId(value: string) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export const POST = withRateLimit<{ params: Promise<{ venueId: string; profileId: string }> }>(
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

    const { venueId, profileId } = await context.params
    const profileNum = parseId(profileId)
    if (profileNum === null) {
      return NextResponse.json({ error: "Invalid profile id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[profiles] /me/venues read error")
    if (!lookup.ok) return lookup.response

    const upload = await request.formData()
    const file = upload.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 })
    }

    try {
      return NextResponse.json(await addProfileGalleryImage(token, lookup.venue.id, profileNum, file), { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[profiles/:id/images] POST error")
    }
  },
  { requests: 20, window: "1 m" }
)
