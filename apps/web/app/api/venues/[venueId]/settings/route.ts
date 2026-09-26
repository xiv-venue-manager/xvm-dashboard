import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma/client"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { VenueSettings, parseVenueSettings } from "@/lib/types/venue-settings"
import { getValidXvmApiToken, invalidateXvmApiCredential, isXvmAuthFailure, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { getVenue, updateVenue, type VenueUpdate } from "@/lib/api/xvm-api"

const webhookSettingsSchema = z.object({
  taskCreated: z.boolean().optional(),
  taskCompleted: z.boolean().optional(),
  partakeEvent: z.boolean().optional(),
  saleLogged: z.boolean().optional(),
  dailySalesSummary: z.boolean().optional(),
  staffJoined: z.boolean().optional(),
})

const discordWebhooksSchema = z.object({
  staff: z.string().optional().or(z.literal("")),
  events: z.string().optional().or(z.literal("")),
  revenue: z.string().optional().or(z.literal("")),
})

const updateSettingsSchema = z.object({
  taskVisibility: z.enum(["all", "assigned", "assigned_unassigned"]).optional(),
  salesVisibility: z.enum(["all", "own", "none"]).optional(),
  revenueVisibility: z.enum(["all", "hide", "own"]).optional(),
  eventVisibility: z.enum(["all", "published"]).optional(),
  webhooks: webhookSettingsSchema.optional(),
  discordWebhooks: discordWebhooksSchema.optional(),
  // Keep for backward compatibility
  discordWebhookUrl: z.string().url().optional().or(z.literal("")),
  // Partake integration
  partakeTeamId: z.number().int().positive().nullable().optional(),
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
  // Venue profile extras stored in settings JSON
  tagline: z.string().max(200).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  defaultHours: z.string().max(100).optional(),
  openNights: z.string().max(100).optional(),
  isAdult: z.boolean().optional(),
  // Discord Shift Bot
  shiftBot: z
    .object({
      enabled: z.boolean(),
      channelId: z.string().max(20),
      daysBeforeEvent: z.number().int().min(1).max(14).optional(),
      templates: z
        .array(
          z.object({
            name: z.string().max(100),
            startOffsetHours: z.number().min(0).max(23),
            durationHours: z.number().min(1).max(24),
            slots: z.number().int().min(1).max(100),
          })
        )
        .max(10),
      thumbnailUrl: z.string().url().optional().or(z.literal("")),
      cachedGuildIconUrl: z.string().optional(),
    })
    .optional(),
  // Room manager roles
  roomManagerRoleIds: z.array(z.string()).optional(),
})

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
      const membership = await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          venueId,
          status: "active",
        },
      })

      if (!membership) {
        return NextResponse.json({ error: "You don't have access to this venue" }, { status: 403 })
      }

      // Get venue settings
      const venue = await prisma.venue.findUnique({
        where: { id: venueId },
        select: {
          settings: true,
          discordWebhookUrl: true,
          partakeTeamId: true,
          venueType: true,
          froggeToken: true,
          xvmApiVenueId: true,
        },
      })

      if (!venue) {
        return NextResponse.json({ error: "Venue not found" }, { status: 404 })
      }

      const responseBody: Record<string, unknown> = {
        ...parseVenueSettings(venue.settings),
        discordWebhookUrl: venue.discordWebhookUrl,
        partakeTeamId: venue.partakeTeamId,
        venueType: venue.venueType,
        froggeToken: venue.froggeToken,
      }

      // Visibility settings and venue type are being migrated to xvm-api - it's the
      // source of truth for connected venues, Prisma's copy is a stale leftover for
      // unconnected ones. On any failure to reach xvm-api, omit these keys entirely
      // (rather than silently serving the stale Prisma copy as current) and flag it,
      // so a page applying this response doesn't snap its controls back to wrong values.
      if (venue.xvmApiVenueId) {
        const token = await getValidXvmApiToken(session.user.id)
        let degraded = true
        if (token) {
          try {
            const detail = await getVenue(token, venue.xvmApiVenueId)
            responseBody.taskVisibility = detail.task_visibility
            responseBody.salesVisibility = detail.sales_visibility
            responseBody.revenueVisibility = detail.revenue_visibility
            responseBody.eventVisibility = detail.event_visibility
            responseBody.venueType = detail.venue_type
            responseBody.name = detail.name
            responseBody.description = detail.description
            responseBody.bannerUrl = detail.banner_url
            responseBody.logoUrl = detail.logo_url
            responseBody.district = detail.district
            responseBody.ward = detail.ward
            responseBody.plot = detail.plot
            responseBody.apartment = detail.room
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
          delete responseBody.name
          delete responseBody.description
          delete responseBody.bannerUrl
          delete responseBody.logoUrl
          delete responseBody.district
          delete responseBody.ward
          delete responseBody.plot
          delete responseBody.apartment
          responseBody.visibilityDegraded = true
        }
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
      const membership = await prisma.membership.findFirst({
        where: {
          userId: session.user.id,
          venueId,
          status: "active",
        },
      })

      if (!membership) {
        return NextResponse.json({ error: "Not a member of this venue" }, { status: 403 })
      }

      const body = await request.json()
      const validatedData = updateSettingsSchema.parse(body)

      // Only OWNER can update most settings; MANAGER can update roomManagerRoleIds and the
      // operational staff-visibility fields. Revenue visibility stays owner-only - it's a
      // financial-disclosure policy call, not day-to-day staff coordination like the other three.
      const isOwner = membership.role === "OWNER"
      const isManager = membership.role === "MANAGER"
      const managerAllowedKeys = new Set(["roomManagerRoleIds", "taskVisibility", "salesVisibility", "eventVisibility"])
      const onlyManagerAllowedFields = Object.keys(validatedData).every((k) => managerAllowedKeys.has(k))

      if (!isOwner && !(isManager && onlyManagerAllowedFields)) {
        return NextResponse.json({ error: "Only venue owners can update settings" }, { status: 403 })
      }

      // Get current settings
      const venue = await prisma.venue.findUnique({
        where: { id: venueId },
        select: { settings: true, xvmApiVenueId: true, venueType: true },
      })

      if (!venue) {
        return NextResponse.json({ error: "Venue not found" }, { status: 404 })
      }

      // Extract top-level venue columns and xvm-api-owned visibility fields from validated data
      const {
        discordWebhookUrl,
        partakeTeamId,
        venueType,
        taskVisibility,
        salesVisibility,
        revenueVisibility,
        eventVisibility,
        ...settingsData
      } = validatedData

      // Visibility settings and venue type are being migrated to xvm-api - it owns these
      // now, Prisma's settings JSON/column stop receiving updates to them for connected venues.
      const xvmUpdate: VenueUpdate = {}
      if (taskVisibility !== undefined) xvmUpdate.task_visibility = taskVisibility
      if (salesVisibility !== undefined) xvmUpdate.sales_visibility = salesVisibility
      if (revenueVisibility !== undefined) xvmUpdate.revenue_visibility = revenueVisibility
      if (eventVisibility !== undefined) xvmUpdate.event_visibility = eventVisibility
      if (venueType !== undefined) xvmUpdate.venue_type = venueType

      let xvmVenueDetail = null
      if (Object.keys(xvmUpdate).length > 0) {
        if (!venue.xvmApiVenueId) {
          return NextResponse.json(
            { error: "not_connected", message: "Connect this venue to xvm-api before changing these settings." },
            { status: 409 }
          )
        }
        const token = await getValidXvmApiToken(session.user.id)
        if (!token) {
          return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
        }
        try {
          xvmVenueDetail = await updateVenue(token, venue.xvmApiVenueId, xvmUpdate)
        } catch (err) {
          return xvmApiErrorResponse(err, session.user.id, "[settings] updateVenue error")
        }
      }

      // Merge new settings with existing settings (type-safe)
      const currentSettings = parseVenueSettings(venue.settings)
      const newSettings: VenueSettings = {
        ...currentSettings,
        ...settingsData,
      }

      // Update venue settings, webhook URL, and Partake team ID
      const updatedVenue = await prisma.venue.update({
        where: { id: venueId },
        data: {
          settings: newSettings as unknown as Prisma.InputJsonValue,
          ...(discordWebhookUrl !== undefined && {
            discordWebhookUrl: discordWebhookUrl || null,
          }),
          ...(partakeTeamId !== undefined && {
            partakeTeamId: partakeTeamId,
          }),
        },
        select: {
          settings: true,
          discordWebhookUrl: true,
          partakeTeamId: true,
        },
      })

      const putResponseBody: Record<string, unknown> = {
        ...parseVenueSettings(updatedVenue.settings),
        discordWebhookUrl: updatedVenue.discordWebhookUrl,
        partakeTeamId: updatedVenue.partakeTeamId,
        venueType: venue.venueType,
      }

      // xvm-api owns these for connected venues. parseVenueSettings above still spreads
      // in the frozen legacy values sitting in Prisma's settings JSON - delete them
      // outright rather than risk serving stale data as current, unless this PUT gave
      // us fresh values to overwrite them with.
      if (xvmVenueDetail) {
        putResponseBody.taskVisibility = xvmVenueDetail.task_visibility
        putResponseBody.salesVisibility = xvmVenueDetail.sales_visibility
        putResponseBody.revenueVisibility = xvmVenueDetail.revenue_visibility
        putResponseBody.eventVisibility = xvmVenueDetail.event_visibility
        putResponseBody.venueType = xvmVenueDetail.venue_type
      } else if (venue.xvmApiVenueId) {
        delete putResponseBody.taskVisibility
        delete putResponseBody.salesVisibility
        delete putResponseBody.revenueVisibility
        delete putResponseBody.eventVisibility
        delete putResponseBody.venueType
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
