import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { createPairingCode } from "@/lib/api/xvm-api"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"

export const POST = withRateLimit(
  async () => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    try {
      const issued = await createPairingCode(token)
      return NextResponse.json({ code: issued.code, expiresAt: issued.expires_at }, { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[plugin pairing] create code error")
    }
  },
  { requests: 10, window: "1 m" }
)
