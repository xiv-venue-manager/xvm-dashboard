import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listMyFfxivListings } from "@/lib/api/xvm-api"

export const GET = withRateLimit(
  async () => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    try {
      return NextResponse.json(await listMyFfxivListings(token))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[ffxivvenues mine] GET error")
    }
  },
  { requests: 10, window: "1 m" }
)
