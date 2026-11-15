import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { deleteProfile, updateProfile, type ProfileUpdate } from "@/lib/api/xvm-api"
import { PROFILE_TEXT_FIELDS, profileUpdateSchema } from "@/lib/profiles"

function parseId(value: string) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; profileId: string }> }>(
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

    let data: z.infer<typeof profileUpdateSchema>
    try {
      data = profileUpdateSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const update: Record<string, unknown> = {}
      if (data.characterName !== undefined) update.character_name = data.characterName
      if (data.color !== undefined) update.color = data.color
      for (const [field, apiField] of Object.entries(PROFILE_TEXT_FIELDS)) {
        const value = data[field as keyof typeof PROFILE_TEXT_FIELDS]
        if (value !== undefined) update[apiField] = value
      }
      return NextResponse.json(await updateProfile(token, lookup.venue.id, profileNum, update as ProfileUpdate))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[profiles/:id] PATCH error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; profileId: string }> }>(
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

    const { venueId, profileId } = await context.params
    const profileNum = parseId(profileId)
    if (profileNum === null) {
      return NextResponse.json({ error: "Invalid profile id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[profiles] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      await deleteProfile(token, lookup.venue.id, profileNum)
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[profiles/:id] DELETE error")
    }
  },
  { requests: 30, window: "1 m" }
)
