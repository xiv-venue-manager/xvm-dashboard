import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { validators } from "@/lib/validation"
import { getOrSet, cacheKeys, cacheTTL, invalidateCache } from "@/lib/redis-cache"
import { ensureManagerRole } from "@/lib/api/venue-setup"
import { sendEmail } from "@/lib/email"
import { venueWelcomeEmail, newVenueAlertEmail } from "@/lib/email-templates"
import { postNewVenue } from "@/lib/discord-feed"
import { asMembership, myVenueRoles, VenueAccessUnavailable } from "@/lib/api/venue-access"

const venueSchema = z.object({
  name: validators.venueName,
  slug: validators.slug,
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
      // Check authentication
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      // Parse and validate request body
      const body = await request.json()
      const validatedData = venueSchema.parse(body)

      // Check if slug already exists
      const existingVenue = await prisma.venue.findUnique({
        where: { slug: validatedData.slug },
      })

      if (existingVenue) {
        return NextResponse.json({ error: "A venue with this slug already exists" }, { status: 400 })
      }

      // Create venue + owner membership + Manager role atomically.
      // The invariant we're enforcing: every active OWNER/MANAGER tier
      // membership has a non-null customRole pointing at a "Manager" role
      // that the plugin's strict role-filter can return. See
      // lib/api/venue-setup.ts for why.
      const userId = session.user.id
      const venue = await prisma.$transaction(async (tx) => {
        const v = await tx.venue.create({
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
            memberships: {
              create: {
                userId,
                role: "OWNER",
                status: "active", // Owner is automatically active, no invite needed
              },
            },
          },
          include: {
            memberships: true,
          },
        })

        const managerRole = await ensureManagerRole(v.id, tx)
        await tx.membership.updateMany({
          where: { venueId: v.id, userId, roleId: null },
          data: { roleId: managerRole.id },
        })

        return v
      })

      // Invalidate user's venue cache
      await invalidateCache(cacheKeys.userVenues(session.user.id))

      // Post to Discord activity feed. Fire-and-forget.
      postNewVenue(venue)

      // Notify owner + admin. Fire-and-forget: signup must not fail on email issues.
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

      return NextResponse.json(venue, { status: 201 })
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
