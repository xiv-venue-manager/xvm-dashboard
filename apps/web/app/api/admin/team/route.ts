import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { addTeamMember, listAdminTeam } from "@/lib/api/xvm-api"

const createSchema = z
  .object({
    person_id: z.number().int().positive(),
    role_title: z.string().min(1).max(80),
    group_label: z.string().min(1).max(40).nullable().optional(),
    sort_order: z.number().int().min(0).optional(),
  })
  .strict()

export const GET = withRateLimit(
  async () => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    try {
      return NextResponse.json(await listAdminTeam(token))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[admin/team] list error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const POST = withRateLimit(
  async (request: NextRequest) => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const parsed = createSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 })
    }

    try {
      return NextResponse.json(await addTeamMember(token, parsed.data), { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[admin/team] add error")
    }
  },
  { requests: 20, window: "1 m" }
)
