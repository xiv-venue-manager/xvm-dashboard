import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { requireVenueRole, type VenueRole } from "@/lib/api/venue-access"

const updateInventorySettingsSchema = z.object({
  enabled: z.boolean(),
})

async function resolveVenueAndRole(
  venueId: string,
  userId: string
): Promise<
  | { error: NextResponse }
  | {
      venue: NonNullable<Awaited<ReturnType<typeof prisma.venue.findFirst>>>
      role: VenueRole
    }
> {
  const venue = await prisma.venue.findFirst({
    where: { OR: [{ id: venueId }, { slug: venueId }] },
  })
  if (!venue) return { error: NextResponse.json({ error: "Venue not found" }, { status: 404 }) }

  const access = await requireVenueRole(userId, venue.id, "STAFF", "You don't have access to this venue")
  if (!access.ok) return { error: access.response }
  return { venue, role: access.role }
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      const { venueId } = await context.params
      const resolved = await resolveVenueAndRole(venueId, session.user.id)
      if ("error" in resolved) return resolved.error

      const settings = await prisma.venueInventorySettings.findUnique({
        where: { venueId: resolved.venue.id },
      })

      return NextResponse.json({
        settings: settings ? { enabled: settings.enabled } : { enabled: false },
      })
    } catch (error) {
      console.error("Error fetching inventory settings:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 60, window: "1 m" }
)

export const PUT = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
      const { venueId } = await context.params
      const resolved = await resolveVenueAndRole(venueId, session.user.id)
      if ("error" in resolved) return resolved.error
      if (!["OWNER", "MANAGER"].includes(resolved.role)) {
        return NextResponse.json({ error: "Only owners and managers can change inventory settings" }, { status: 403 })
      }

      const body = await request.json()
      const data = updateInventorySettingsSchema.parse(body)

      const settings = await prisma.venueInventorySettings.upsert({
        where: { venueId: resolved.venue.id },
        create: { venueId: resolved.venue.id, ...data },
        update: data,
      })

      return NextResponse.json({ settings: { enabled: settings.enabled } })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
      }
      console.error("Error updating inventory settings:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 10, window: "1 m" }
)
