import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { setMyTeamPhoto } from "@/lib/api/xvm-api"
import { refreshTeamPage } from "@/lib/refresh-team"

export const PUT = withRateLimit(
  async (request: NextRequest) => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const form = await request.formData().catch(() => null)
    const file = form?.get("file")
    if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 })

    try {
      const profile = await setMyTeamPhoto(token, file)
      refreshTeamPage()
      return NextResponse.json(profile)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[team/profile/photo] PUT error")
    }
  },
  { requests: 10, window: "1 m" }
)
