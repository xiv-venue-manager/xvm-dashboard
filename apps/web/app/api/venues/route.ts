import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { validators } from "@/lib/validation"
import { getOrSet, cacheKeys, cacheTTL, invalidateCache } from "@/lib/redis-cache"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { createVenue, updateVenue, type VenueUpdate } from "@/lib/api/xvm-api"
import { sendEmail } from "@/lib/email"
import { venueWelcomeEmail, newVenueAlertEmail } from "@/lib/email-templates"
import { postNewVenue } from "@/lib/discord-feed"
import { addressProblem } from "@/lib/venue-location"
import { asMembership, myVenues, VenueAccessUnavailable } from "@/lib/api/venue-access"

const venueSchema = z.object({
  name: validators.venueName,
  slug: validators.slug.max(50, "Slug too long (max 50 characters)"),
  description: validators.venueDescription,
  dataCenter: z.string().min(1, "Data center is required").max(50, "Data center name too long"),
  world: z.string().min(1, "World is required").max(50, "World name too long"),
  district: validators.venueDistrict,
  ward: validators.venueWard,
  plot: validators.venuePlot,
  apartment: validators.venueApartment,
  subdivision: validators.venueSubdivision,
  settings: z
    .object({
      tagline: validators.venueTagline.optional(),
      tags: validators.venueTags.optional(),
      isAdult: z.boolean().optional(),
    })
    .optional(),
})

export const POST = withRateLimit(
  async (request: NextRequest) => {
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const body = await request.json()
      const validatedData = venueSchema.parse(body)

      const addressError = addressProblem(validatedData)
      if (addressError) return NextResponse.json({ error: addressError }, { status: 400 })

      const userId = session.user.id
      const token = await getValidXvmApiToken(userId)
      if (!token) {
        return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
      }

      let created
      try {
        created = await createVenue(token, {
          name: validatedData.name,
          slug: validatedData.slug,
          data_center: validatedData.dataCenter,
          world: validatedData.world,
        })
      } catch (err) {
        return xvmApiErrorResponse(err, userId, "[venue create] xvm-api create error")
      }

      const profile: VenueUpdate = {}
      if (validatedData.description) profile.description = validatedData.description.trim()
      if (validatedData.district) profile.district = validatedData.district.trim()
      if (validatedData.ward != null) profile.ward = validatedData.ward
      if (validatedData.plot != null) profile.plot = validatedData.plot
      if (validatedData.apartment != null) {
        profile.room = validatedData.apartment
        profile.subdivision = validatedData.subdivision
      }

      const extras = validatedData.settings
      if (extras?.tagline?.trim()) profile.tagline = extras.tagline.trim()
      if (extras?.tags?.length) profile.tags = extras.tags
      if (extras?.isAdult) profile.is_adult = true

      let profileSaved = true
      if (Object.keys(profile).length > 0) {
        try {
          await updateVenue(token, created.id, profile)
        } catch (err) {
          profileSaved = false
          console.error(`[venue create] profile update failed for xvm-api venue ${created.id}:`, err)
        }
      }

      await invalidateCache(cacheKeys.userVenues(userId))

      const venue = {
        id: created.id,
        xvmApiVenueId: created.id,
        name: created.name,
        slug: created.slug,
        dataCenter: created.data_center,
        world: created.world,
        district: validatedData.district ?? null,
        ward: validatedData.ward ?? null,
        plot: validatedData.plot ?? null,
      }

      postNewVenue(venue)

      const ownerEmail = session.user.email
      if (ownerEmail) {
        sendEmail({
          to: ownerEmail,
          ...venueWelcomeEmail({ venueName: venue.name, slug: venue.slug, ownerName: session.user.name }),
        }).catch(() => {})

        sendEmail({
          to: "rgcsubsonik@gmail.com",
          ...newVenueAlertEmail({
            venueName: venue.name,
            slug: venue.slug,
            ownerEmail,
            dataCenter: venue.dataCenter,
            world: venue.world,
          }),
        }).catch(() => {})
      }

      return NextResponse.json({ ...venue, profileSaved }, { status: 201 })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
      }

      console.error("Error creating venue:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 10, window: "1 m" }
)

export const GET = withRateLimit(
  async () => {
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      // Cache venues per user (5 minute TTL)
      const cacheKey = cacheKeys.userVenues(session.user.id)
      const venues = await getOrSet(
        cacheKey,
        async () => {
          const venues = await myVenues(session.user.id)
          return venues.map(({ id, name, slug, dataCenter, world, role }) => ({
            id,
            name,
            slug,
            dataCenter,
            world,
            xvmApiVenueId: id,
            memberships: [asMembership(session.user.id, id, role)],
          }))
        },
        cacheTTL.venue
      )

      return NextResponse.json(venues)
    } catch (error) {
      if (error instanceof VenueAccessUnavailable) {
        return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
      }
      console.error("Error fetching venues:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 60, window: "1 m" }
)
