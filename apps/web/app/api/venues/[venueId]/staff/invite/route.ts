import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { validators } from "@/lib/validation"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { createInvite } from "@/lib/api/xvm-api"

const inviteSchema = z.object({
  role: z.enum(["STAFF", "MANAGER", "OWNER"], { message: "Invalid role" }),
  invitedName: z.string().max(100, "Name too long (max 100 characters)").optional().nullable(),
  discordId: validators.snowflake.optional().nullable(),
})

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findFirst({
    where: { OR: [{ id: venueId }, { slug: venueId }] },
    select: { xvmApiVenueId: true },
  })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId }
}

export const POST = withRateLimit<{ params: Promise<{ venueId: string }> }>(
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

    const { venueId } = await context.params
    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let role: "STAFF" | "MANAGER" | "OWNER", invitedName: string | null | undefined, discordId: string | null | undefined
    try {
      const parsed = inviteSchema.parse(await request.json())
      role = parsed.role
      invitedName = parsed.invitedName
      discordId = parsed.discordId
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      // Permission checks (manager/owner can invite, only owners invite
      // owners) are enforced by xvm-api itself on the caller's token - no
      // other xvm-api-cutover route in this codebase re-checks tier
      // client-side (see roles/route.ts, tasks/route.ts), so this matches
      // established pattern rather than duplicating the old Prisma-era check.
      const invite = await createInvite(token, gate.xvmApiVenueId!, {
        display_name: invitedName || "Unnamed",
        tier: role.toLowerCase() as "owner" | "manager" | "staff",
        external_id: discordId || null,
      })

      const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3000}`
      const inviteUrl = `${baseUrl}/invite/${invite.token}`

      return NextResponse.json({
        success: true,
        invite: {
          id: invite.id,
          inviteUrl,
          inviteToken: invite.token,
          expiresAt: invite.expires_at,
          role,
          invitedName,
        },
      })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[staff/invite] POST error")
    }
  },
  { requests: 10, window: "1 m" }
)
