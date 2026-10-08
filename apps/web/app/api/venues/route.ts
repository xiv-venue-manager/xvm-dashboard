import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { validators } from "@/lib/validation"
import { getOrSet, cacheKeys, cacheTTL, invalidateCache } from "@/lib/redis-cache"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { createVenue, updateVenue, type VenueUpdate } from "@/lib/api/xvm-api"
import { sendEmail } from "@/lib/email"
import { venueWelcomeEmail, newVenueAlertEmail } from "@/lib/email-templates"
import { postNewVenue } from "@/lib/discord-feed"
import { asMembership, myVenueRoles, VenueAccessUnavailable } from "@/lib/api/venue-access"

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

      const existingVenue = await prisma.venue.findUnique({
        where: { slug: validatedData.slug },
      })

      if (existingVenue) {
        return NextResponse.json({ error: "A venue with this slug already exists" }, { status: 400 })
      }

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
      if (validatedData.apartment != null) profile.room = validatedData.apartment

      let profileSaved = true
      if (Object.keys(profile).length > 0) {
        try {
          await updateVenue(token, created.id, profile)
        } catch (err) {
          profileSaved = false
          console.error(`[venue create] profile update failed for xvm-api venue ${created.id}:`, err)
        }
      }

      const venue = await prisma.venue
        .create({
          data: {
            name: validatedData.name,
            slug: validatedData.slug,
            description: validatedData.description,
            dataCenter: validatedData.dataCenter,
            world: validatedData.world,
            district: validatedData.district ?? null,
            ward: validatedData.ward ?? null,
            plot: validatedData.plot ?? null,
            apartment: validatedData.apartment ?? null,
            ownerId: userId,
            xvmApiVenueId: created.id,
            xvmApiVenueLinkedAt: new Date(),
            xvmApiVenueLinkedBy: userId,
          },
        })
        .catch((err: unknown) => {
          console.error(`[venue create] bridge row failed; orphaned xvm-api venue ${created.id}:`, err)
          throw err
        })

      await invalidateCache(cacheKeys.userVenues(userId))

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
  async (request: NextRequest) => {
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
          const roles = await myVenueRoles(session.user.id)
          const rows = await prisma.venue.findMany({ where: { id: { in: [...roles.keys()] } } })
          return rows.flatMap((venue) => {
            const role = roles.get(venue.id)
            return role ? [{ ...venue, memberships: [asMembership(session.user.id, venue.id, role)] }] : []
          })
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
