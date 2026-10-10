import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { invalidateCache, cacheKeys } from "@/lib/redis-cache"
import { validators } from "@/lib/validation"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireVenueRole } from "@/lib/api/venue-access"
import { addressProblem } from "@/lib/venue-location"
import { updateVenue, type VenueUpdate } from "@/lib/api/xvm-api"

const venueUpdateSchema = z.object({
  name: validators.venueName.optional(),
  description: validators.venueDescription,
  district: validators.venueDistrict,
  ward: validators.venueWard,
  plot: validators.venuePlot,
  apartment: validators.venueApartment,
  subdivision: validators.venueSubdivision,
  bannerUrl: validators.url,
  logoUrl: validators.url,
})

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true, slug: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId, slug: venue.slug }
}

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { venueId } = await context.params

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    const body = await request.json()
    let parsed: z.infer<typeof venueUpdateSchema>
    try {
      parsed = venueUpdateSchema.parse(body)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
      }
      throw error
    }
    const { name, description, district, ward, plot, apartment, subdivision, bannerUrl, logoUrl } = parsed

    const sendsLocation = [district, ward, plot, apartment, subdivision].some((field) => field !== undefined)
    if (sendsLocation) {
      const addressError = addressProblem({ district, ward, plot, apartment, subdivision })
      if (addressError) return NextResponse.json({ error: addressError }, { status: 400 })
    }

    // apartment -> room: Prisma's "apartment" column has always meant the
    // apartment unit number (UI-labelled "Room" already). xvm-api has a
    // separate, unrelated "apartment" field with no evidence of intended use
    // anywhere (no test, no comment, absent from the plugin's real housing
    // data model, which only has plot/ward/room/district). Never write it.
    const xvmUpdate: VenueUpdate = {
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description ? description.trim() : null }),
      ...(district !== undefined && { district: district ? district.trim() : null }),
      ...(ward !== undefined && { ward }),
      ...(plot !== undefined && { plot }),
      ...(apartment !== undefined && { room: apartment }),
      ...(subdivision !== undefined && { subdivision: apartment != null ? subdivision : null }),
      ...(bannerUrl !== undefined && { banner_url: bannerUrl ?? null }),
      ...(logoUrl !== undefined && { logo_url: logoUrl ?? null }),
    }

    try {
      const updated = await updateVenue(token, gate.xvmApiVenueId!, xvmUpdate)
      await Promise.all([
        invalidateCache(cacheKeys.venue(venueId)),
        invalidateCache(cacheKeys.venueBySlug(gate.slug!)),
        invalidateCache(cacheKeys.userVenues(session.user.id)),
      ])
      return NextResponse.json(updated)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[venue] PATCH error")
    }
  },
  { requests: 20, window: "1 m" }
)

export const DELETE = withRateLimit(
  async (request: NextRequest, context?: { params: Promise<{ venueId: string }> }) => {
    try {
      // Check authentication
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      if (!context?.params) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 })
      }

      const { venueId } = await context.params

      const access = await requireVenueRole(session.user.id, venueId, "OWNER", "Only venue owners can delete venues")
      if (!access.ok) return access.response

      const venue = await prisma.venue.findUnique({ where: { id: venueId } })
      if (!venue) {
        return NextResponse.json({ error: "Venue not found" }, { status: 404 })
      }

      // Delete venue (cascade will handle related records)
      await prisma.venue.delete({
        where: { id: venueId },
      })

      // Invalidate all related caches
      await Promise.all([
        invalidateCache(cacheKeys.userVenues(session.user.id)),
        invalidateCache(cacheKeys.venue(venueId)),
        invalidateCache(cacheKeys.venueBySlug(venue.slug)),
        invalidateCache(`venue:${venueId}:*`), // All venue-related caches
      ])

      return NextResponse.json({ message: "Venue deleted successfully" }, { status: 200 })
    } catch (error) {
      console.error("Error deleting venue:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  {
    requests: 3,
    window: "1 m",
    getIdentifier: async (req) => {
      const session = await getServerSession(authOptions)
      const userId = session?.user?.id
      if (userId) return `user:${userId}:DELETE:${req.nextUrl.pathname}`
      return `ip:${req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? req.headers.get("x-real-ip") ?? "anonymous"}:DELETE:${req.nextUrl.pathname}`
    },
  }
)
