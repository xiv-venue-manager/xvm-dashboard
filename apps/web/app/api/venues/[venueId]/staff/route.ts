import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { listMemberships, listPositions, type MembershipRow, type PositionRow } from "@/lib/api/xvm-api"

// Old email-based invitation system has been replaced
// Use POST /api/venues/[venueId]/staff/invite instead

// Maps a MembershipRow onto the shape staff-table.tsx currently expects (the
// pre-cutover Prisma shape) so a later task's component update has less
// surface area to change. Fields with no xvm-api equivalent (joinedAt,
// isOnShift, per-position color) are left as best-effort placeholders - see
// PR description for the known gaps.
function toStaffShape(member: MembershipRow, positionsById: Map<number, PositionRow>, venueId: string) {
  return {
    id: member.id,
    role: member.effective_tier.toUpperCase(),
    baseRole: member.tier.toUpperCase(),
    customRole: null,
    additionalRoles: member.position_ids
      .map((id) => positionsById.get(id))
      .filter((p): p is PositionRow => Boolean(p))
      .map((p) => ({ id: p.id, name: p.name, color: p.color })),
    joinedAt: null,
    isOnShift: false,
    nickname: member.nickname,
    user: {
      id: member.person.id,
      name: member.person.display_name,
      displayName: member.person.display_name,
      image: null,
      characterName: null,
      discordId: member.person.discord_id,
    },
    venueId,
  }
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
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
    const lookup = await requireMyVenue(session.user.id, venueId, "[staff] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      const [memberships, positions] = await Promise.all([
        listMemberships(token, lookup.venue.id),
        listPositions(token, lookup.venue.id),
      ])
      const positionsById = new Map(positions.map((p) => [p.id, p]))
      // roster() deliberately returns every membership at the venue, employed or
      // not - xvm-api keeps terminated rows as history rather than deleting them.
      // This route is the active roster; terminated members belong on a separate
      // "former staff" view (not built yet), not silently mixed into this one.
      const shaped = memberships.filter((m) => m.is_employed).map((m) => toStaffShape(m, positionsById, venueId))
      return NextResponse.json(shaped)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[staff] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)

export async function POST() {
  // This endpoint has been deprecated in favor of the invite link system
  // Use POST /api/venues/[venueId]/staff/invite instead
  return NextResponse.json(
    {
      error: "This endpoint is deprecated. Use POST /api/venues/[venueId]/staff/invite to generate invite links.",
      migration:
        "The venue manager now uses Discord-only authentication with unique invite links. Email-based invitations are no longer supported.",
    },
    { status: 410 } // 410 Gone
  )
}
