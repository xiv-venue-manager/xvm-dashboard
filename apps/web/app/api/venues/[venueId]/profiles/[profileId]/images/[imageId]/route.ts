import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { deleteProfileGalleryImage, updateProfileGalleryImage } from "@/lib/api/xvm-api"
import { imageUpdateSchema } from "@/lib/profiles"

function parseId(value: string) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; profileId: string; imageId: string }> }>(
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

    const { venueId, profileId, imageId } = await context.params
    const profileNum = parseId(profileId)
    if (profileNum === null) {
      return NextResponse.json({ error: "Invalid profile id" }, { status: 400 })
    }
    const imageNum = parseId(imageId)
    if (imageNum === null) {
      return NextResponse.json({ error: "Invalid image id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[profiles] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof imageUpdateSchema>
    try {
      data = imageUpdateSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      return NextResponse.json(
        await updateProfileGalleryImage(token, lookup.venue.id, profileNum, imageNum, {
          ...(data.caption !== undefined && { caption: data.caption }),
          ...(data.sortOrder !== undefined && { sort_order: data.sortOrder }),
        })
      )
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[profiles/:id/images/:id] PATCH error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; profileId: string; imageId: string }> }>(
  async (_request, context) => {
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

    const { venueId, profileId, imageId } = await context.params
    const profileNum = parseId(profileId)
    if (profileNum === null) {
      return NextResponse.json({ error: "Invalid profile id" }, { status: 400 })
    }
    const imageNum = parseId(imageId)
    if (imageNum === null) {
      return NextResponse.json({ error: "Invalid image id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[profiles] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      await deleteProfileGalleryImage(token, lookup.venue.id, profileNum, imageNum)
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[profiles/:id/images/:id] DELETE error")
    }
  },
  { requests: 30, window: "1 m" }
)
