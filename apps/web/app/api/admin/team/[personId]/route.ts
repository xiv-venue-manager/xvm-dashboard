import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { removeTeamMember, updateTeamMember } from "@/lib/api/xvm-api"
import { refreshTeamPage } from "@/lib/refresh-team"

const updateSchema = z
  .object({
    role_title: z.string().min(1).max(80).optional(),
    group_label: z.string().min(1).max(40).nullable().optional(),
    sort_order: z.number().int().min(0).optional(),
  })
  .strict()

type Context = { params: Promise<{ personId: string }> }

export const PATCH = withRateLimit<Context>(
  async (request: NextRequest, context) => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const { personId } = await context!.params
    if (!/^\d+$/.test(personId)) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const parsed = updateSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 })
    }

    try {
      const member = await updateTeamMember(token, Number(personId), parsed.data)
      refreshTeamPage()
      return NextResponse.json(member)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[admin/team] update error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const DELETE = withRateLimit<Context>(
  async (request, context) => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const { personId } = await context!.params
    if (!/^\d+$/.test(personId)) return NextResponse.json({ error: "Not found" }, { status: 404 })

    try {
      await removeTeamMember(token, Number(personId))
      refreshTeamPage()
      return NextResponse.json({ success: true })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[admin/team] remove error")
    }
  },
  { requests: 20, window: "1 m" }
)
