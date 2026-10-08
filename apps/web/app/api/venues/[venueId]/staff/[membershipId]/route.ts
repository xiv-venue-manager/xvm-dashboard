import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, getValidXvmApiPersonId, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import {
  setNickname,
  setTier,
  setMembershipPositions,
  terminateMembership,
  listMemberships,
  listTasks,
  assignTask,
  listPositions,
  XvmApiError,
  xvmErrorMessage,
  type MembershipRow,
  type PositionRow,
} from "@/lib/api/xvm-api"

// Dropped from the old Prisma-era body: roleId (xvm-api's Position model has
// no primary/secondary distinction - all assigned positions are equivalent,
// see PR description for the StaffTable chip-styling implication), status,
// invitedName, invitedEmail, temporaryRole, temporaryRoleExpiresAt,
// permanentRole, tipPooled (no xvm-api equivalent for any of these yet).
const updateStaffSchema = z.object({
  nickname: z.string().max(50).nullable().optional(),
  role: z.enum(["OWNER", "MANAGER", "STAFF"]).optional(),
  additionalRoleIds: z.array(z.number()).optional(),
})

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findFirst({
    where: { OR: [{ id: venueId }, { slug: venueId }] },
    select: { id: true, xvmApiVenueId: true },
  })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { prismaVenueId: venue.id, xvmApiVenueId: venue.xvmApiVenueId }
}

// Mirrors staff/route.ts's toStaffShape (duplicated per this codebase's
// per-route-file convention).
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

export const PUT = withRateLimit<{ params: Promise<{ venueId: string; membershipId: string }> }>(
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

    const { venueId, membershipId } = await context.params
    const id = Number(membershipId)
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof updateStaffSchema>
    try {
      data = updateStaffSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: err.issues }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      let current: MembershipRow | undefined
      // nickname/role/positions are three independent xvm-api calls for what the
      // dashboard still submits as one form. If a later call fails after an
      // earlier one already landed, a blanket error would hide that partial
      // success from the caller - surface it instead, matching the pattern
      // tasks/[taskId]/route.ts uses for its own descriptive-edit + assign split.
      try {
        if (data.nickname !== undefined) {
          current = await setNickname(token, gate.xvmApiVenueId!, id, data.nickname)
        }
        if (data.role !== undefined) {
          current = await setTier(token, gate.xvmApiVenueId!, id, data.role.toLowerCase() as "owner" | "manager" | "staff")
        }
        if (data.additionalRoleIds !== undefined) {
          current = await setMembershipPositions(token, gate.xvmApiVenueId!, id, data.additionalRoleIds)
        }
      } catch (stepErr) {
        if (current && stepErr instanceof XvmApiError && stepErr.status !== 401) {
          const positions = await listPositions(token, gate.xvmApiVenueId!)
          const positionsById = new Map(positions.map((p) => [p.id, p]))
          return NextResponse.json(
            { ...toStaffShape(current, positionsById, venueId), partial: true, error: xvmErrorMessage(stepErr) },
            { status: 200 }
          )
        }
        throw stepErr
      }

      if (!current) {
        const memberships = await listMemberships(token, gate.xvmApiVenueId!)
        current = memberships.find((m) => m.id === id)
        if (!current) {
          return NextResponse.json({ error: "Staff member not found" }, { status: 404 })
        }
      }

      const positions = await listPositions(token, gate.xvmApiVenueId!)
      const positionsById = new Map(positions.map((p) => [p.id, p]))
      return NextResponse.json(toStaffShape(current, positionsById, venueId))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[staff] PUT error")
    }
  },
  { requests: 20, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; membershipId: string }> }>(
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

    const { venueId, membershipId } = await context.params
    const id = Number(membershipId)
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      const callerPersonId = await getValidXvmApiPersonId(session.user.id)
      const memberships = await listMemberships(token, gate.xvmApiVenueId!)

      const targetMembership = memberships.find((m) => m.id === id)
      if (!targetMembership) {
        return NextResponse.json({ error: "Staff member not found" }, { status: 404 })
      }

      // Defense-in-depth only - xvm-api's terminate endpoint already enforces
      // authority server-side. Not the sole guard.
      const callerMembership = memberships.find((m) => m.person.id === callerPersonId)
      if (!callerMembership || !["owner", "manager"].includes(callerMembership.effective_tier)) {
        return NextResponse.json({ error: "You don't have permission to remove staff" }, { status: 403 })
      }
      if (callerMembership.effective_tier === "manager" && targetMembership.effective_tier !== "staff") {
        return NextResponse.json({ error: "Managers can only remove staff" }, { status: 403 })
      }

      // Terminate first - xvm-api's own guards (last-owner protection, etc.)
      // can still refuse this. Doing the cleanup below only after it succeeds
      // means a refused termination never leaves tasks unassigned or API keys
      // revoked for someone who's still an active member.
      await terminateMembership(token, gate.xvmApiVenueId!, id)

      // Once termination has landed, a cleanup failure must never surface as a
      // plain error - the member really is terminated at that point, and a
      // blanket error response would tell the caller otherwise while leaving
      // tasks half-cleaned. Same partial-success shape PUT above uses.
      try {
        const tasks = await listTasks(token, gate.xvmApiVenueId!, {})
        const openAssignedTasks = tasks.filter(
          (t) => t.assigned_membership_id === id && !t.completed_at && !t.cancelled_at
        )
        await Promise.all(
          openAssignedTasks.map((task) => assignTask(token, gate.xvmApiVenueId!, task.id, { membership_id: null }))
        )

        const discordId = targetMembership.person.discord_id
        const account = discordId
          ? await prisma.account.findFirst({
              where: { provider: "discord", providerAccountId: discordId },
              select: { userId: true },
            })
          : null
        if (account) {
          await prisma.apiKey.updateMany({
            where: { userId: account.userId, venueId: gate.prismaVenueId!, revokedAt: null },
            data: { revokedAt: new Date() },
          })
        }
      } catch (cleanupErr) {
        const message =
          cleanupErr instanceof XvmApiError ? xvmErrorMessage(cleanupErr) : "Task/key cleanup failed after termination"
        return NextResponse.json({ success: true, partial: true, error: message }, { status: 200 })
      }

      return NextResponse.json({ success: true })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[staff] DELETE error")
    }
  },
  { requests: 5, window: "1 m" }
)
