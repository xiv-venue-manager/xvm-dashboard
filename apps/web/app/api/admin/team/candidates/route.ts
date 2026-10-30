import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { searchTeamCandidates } from "@/lib/api/xvm-api"

export const GET = withRateLimit(
  async (request: NextRequest) => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const q = new URL(request.url).searchParams.get("q")?.trim() ?? ""
    if (q.length < 2 || q.length > 100) {
      return NextResponse.json({ error: "Type at least two letters of their name." }, { status: 400 })
    }

    try {
      return NextResponse.json(await searchTeamCandidates(token, q))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[admin/team] candidates error")
    }
  },
  { requests: 60, window: "1 m" }
)
