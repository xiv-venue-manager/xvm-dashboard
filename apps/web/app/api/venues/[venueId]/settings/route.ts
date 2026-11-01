import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireMyVenueRole } from "@/lib/api/venue-access"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { validators } from "@/lib/validation"
import { parseVenueSettings } from "@/lib/types/venue-settings"
import { getValidXvmApiToken, invalidateXvmApiCredential, isXvmAuthFailure, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { getVenue, updateVenue, type VenueUpdate } from "@/lib/api/xvm-api"

const updateSettingsSchema = z.object({
  taskVisibility: z.enum(["all", "assigned", "assigned_unassigned"]).optional(),
  salesVisibility: z.enum(["all", "own", "none"]).optional(),
  revenueVisibility: z.enum(["all", "hide", "own"]).optional(),
  eventVisibility: z.enum(["all", "published"]).optional(),
  // Venue type
  venueType: z
    .enum([
      "BAR_TAVERN",
      "NIGHTCLUB",
      "LOUNGE",
      "HOST_CLUB",
      "CABARET",
      "BATHHOUSE",
      "CASINO",
      "STUDIO",
      "OTHER",
      "TEST_VENUE",
    ])
    .nullable()
    .optional(),
  // Venue profile extras
  tagline: validators.venueTagline.optional(),
  tags: validators.venueTags.optional(),
  isAdult: z.boolean().optional(),
})

function servedSettings(value: unknown): Record<string, unknown> {
  const settings: Record<string, unknown> = { ...parseVenueSettings(value) }
  delete settings.webhooks
  delete settings.discordWebhooks
  return settings
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const { params } = context
      const { venueId } = await params

      // Check if user has access to this venue
      const access = await requireMyVenueRole(
        session.user.id,
        venueId,
        "STAFF",
        "You don't have access to this venue",
        "[settings] /me/venues read error"
      )
      if (!access.ok) return access.response
      const xvmVenueId = access.venue.id

      // Get venue settings
      const venue = await prisma.venue.findUnique({
        where: { xvmApiVenueId: xvmVenueId },
        select: {
          settings: true,
          venueType: true,
        },
      })

      if (!venue) {
        return NextResponse.json({ error: "Venue not found" }, { status: 404 })
      }

      const responseBody: Record<string, unknown> = {
        ...servedSettings(venue.settings),
        venueType: venue.venueType,
      }

      // Visibility settings, venue type, tagline, tags and the adult flag are being migrated to xvm-api - it's the
      // source of truth for connected venues, Prisma's copy is a stale leftover for
      // unconnected ones. On any failure to reach xvm-api, omit these keys entirely
      // (rather than silently serving the stale Prisma copy as current) and flag it,
      // so a page applying this response doesn't snap its controls back to wrong values.
      const token = await getValidXvmApiToken(session.user.id)
      let degraded = true
      if (token) {
        try {
          const detail = await getVenue(token, xvmVenueId)
          responseBody.taskVisibility = detail.task_visibility
          responseBody.salesVisibility = detail.sales_visibility
          responseBody.revenueVisibility = detail.revenue_visibility
          responseBody.eventVisibility = detail.event_visibility
          responseBody.venueType = detail.venue_type
          responseBody.tagline = detail.tagline ?? ""
          responseBody.tags = detail.tags
          responseBody.isAdult = detail.is_adult
          responseBody.name = detail.name
          responseBody.description = detail.description
          responseBody.bannerUrl = detail.banner_url
          responseBody.logoUrl = detail.logo_url
          responseBody.district = detail.district
          responseBody.ward = detail.ward
          responseBody.plot = detail.plot
          responseBody.apartment = detail.room
          responseBody.subdivision = detail.subdivision
          degraded = false
        } catch (err) {
          if (isXvmAuthFailure(err)) {
            await invalidateXvmApiCredential(session.user.id)
          }
          console.error("[settings] getVenue error:", err)
        }
      }
      if (degraded) {
        delete responseBody.taskVisibility
        delete responseBody.salesVisibility
        delete responseBody.revenueVisibility
        delete responseBody.eventVisibility
        delete responseBody.venueType
        delete responseBody.tagline
        delete responseBody.tags
        delete responseBody.isAdult
        delete responseBody.name
        delete responseBody.description
        delete responseBody.bannerUrl
        delete responseBody.logoUrl
        delete responseBody.district
        delete responseBody.ward
        delete responseBody.plot
        delete responseBody.apartment
        delete responseBody.subdivision
        responseBody.visibilityDegraded = true
      }

      return NextResponse.json(responseBody)
    } catch (error) {
      console.error("Error fetching venue settings:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 60, window: "1 m" }
)

export const PUT = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const { params } = context
      const { venueId } = await params

      // Check if user has permission to update settings
      const access = await requireMyVenueRole(
        session.user.id,
        venueId,
        "STAFF",
        "Not a member of this venue",
        "[settings] /me/venues read error"
      )
      if (!access.ok) return access.response
      const xvmVenueId = access.venue.id

      const body = await request.json()
      const validatedData = updateSettingsSchema.parse(body)

      // Only OWNER can update most settings; MANAGER can update the operational
      // staff-visibility fields. Revenue visibility stays owner-only - it's a
      // financial-disclosure policy call, not day-to-day staff coordination like the other three.
      const isOwner = access.venue.role === "OWNER"
      const isManager = access.venue.role === "MANAGER"
      const managerAllowedKeys = new Set(["taskVisibility", "salesVisibility", "eventVisibility"])
      const onlyManagerAllowedFields = Object.keys(validatedData).every((k) => managerAllowedKeys.has(k))

      if (!isOwner && !(isManager && onlyManagerAllowedFields)) {
        return NextResponse.json({ error: "Only venue owners can update settings" }, { status: 403 })
      }

      // Extract top-level venue columns and xvm-api-owned visibility fields from validated data
      const {
        venueType,
        taskVisibility,
        salesVisibility,
        revenueVisibility,
        eventVisibility,
        tagline,
        tags,
        isAdult,
      } = validatedData

      // xvm-api owns every setting this route saves. Nothing is written to Prisma's settings JSON any more.
      const xvmUpdate: VenueUpdate = {}
      if (taskVisibility !== undefined) xvmUpdate.task_visibility = taskVisibility
      if (salesVisibility !== undefined) xvmUpdate.sales_visibility = salesVisibility
      if (revenueVisibility !== undefined) xvmUpdate.revenue_visibility = revenueVisibility
      if (eventVisibility !== undefined) xvmUpdate.event_visibility = eventVisibility
      if (venueType !== undefined) xvmUpdate.venue_type = venueType
      if (tagline !== undefined) xvmUpdate.tagline = tagline.trim() || null
      if (tags !== undefined) xvmUpdate.tags = tags
      if (isAdult !== undefined) xvmUpdate.is_adult = isAdult

      let xvmVenueDetail = null
      if (Object.keys(xvmUpdate).length > 0) {
        const token = await getValidXvmApiToken(session.user.id)
        if (!token) {
          return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
        }
        try {
          xvmVenueDetail = await updateVenue(token, xvmVenueId, xvmUpdate)
        } catch (err) {
          return xvmApiErrorResponse(err, session.user.id, "[settings] updateVenue error")
        }
      }

      const putResponseBody: Record<string, unknown> = {}
      if (xvmVenueDetail) {
        putResponseBody.taskVisibility = xvmVenueDetail.task_visibility
        putResponseBody.salesVisibility = xvmVenueDetail.sales_visibility
        putResponseBody.revenueVisibility = xvmVenueDetail.revenue_visibility
        putResponseBody.eventVisibility = xvmVenueDetail.event_visibility
        putResponseBody.venueType = xvmVenueDetail.venue_type
        putResponseBody.tagline = xvmVenueDetail.tagline ?? ""
        putResponseBody.tags = xvmVenueDetail.tags
        putResponseBody.isAdult = xvmVenueDetail.is_adult
      }

      return NextResponse.json(putResponseBody)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
      }

      console.error("Error updating venue settings:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 20, window: "1 m" }
)
