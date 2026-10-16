import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { invalidateCache, cacheKeys } from "@/lib/redis-cache"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { getVenue, uploadVenueImage, deleteVenueImage } from "@/lib/api/xvm-api"

// GET: the venue's current gallery images
export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { venueId } = await context.params

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const lookup = await requireMyVenue(session.user.id, venueId, "[gallery] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      const detail = await getVenue(token, lookup.venue.id)
      return NextResponse.json(detail.images)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[gallery] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)

// POST: upload a new gallery image
export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { venueId } = await context.params

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const lookup = await requireMyVenue(session.user.id, venueId, "[gallery] /me/venues read error")
    if (!lookup.ok) return lookup.response

    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 })
    }

    try {
      const image = await uploadVenueImage(token, lookup.venue.id, file)
      await invalidateCache(cacheKeys.userVenues(session.user.id))
      return NextResponse.json(image, { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[gallery] POST error")
    }
  },
  { requests: 30, window: "1 m" }
)

// DELETE: remove a gallery image by id
export const DELETE = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { venueId } = await context.params

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const lookup = await requireMyVenue(session.user.id, venueId, "[gallery] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let imageId: number
    try {
      const body = await request.json()
      imageId = Number(body?.imageId)
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    if (!Number.isInteger(imageId)) {
      return NextResponse.json({ error: "imageId required" }, { status: 400 })
    }

    try {
      await deleteVenueImage(token, lookup.venue.id, imageId)
      await invalidateCache(cacheKeys.userVenues(session.user.id))
      return NextResponse.json({ success: true })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[gallery] DELETE error")
    }
  },
  { requests: 30, window: "1 m" }
)
