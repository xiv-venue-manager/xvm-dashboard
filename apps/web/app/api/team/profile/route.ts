import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { getMyTeamProfile, updateMyTeamProfile } from "@/lib/api/xvm-api"
import { TEAM_BIO_MAX } from "@/lib/team-groups"
import { refreshTeamPage } from "@/lib/refresh-team"

const updateSchema = z
  .object({
    bio: z.string().max(TEAM_BIO_MAX).nullable().optional(),
    listed: z.boolean().optional(),
  })
  .strict()

export const GET = withRateLimit(
  async () => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    try {
      return NextResponse.json(await getMyTeamProfile(token))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[team/profile] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const PATCH = withRateLimit(
  async (request: NextRequest) => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const parsed = updateSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 })
    }

    try {
      const profile = await updateMyTeamProfile(token, parsed.data)
      refreshTeamPage()
      return NextResponse.json(profile)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[team/profile] PATCH error")
    }
  },
  { requests: 20, window: "1 m" }
)
