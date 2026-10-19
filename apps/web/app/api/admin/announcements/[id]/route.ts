import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { deleteAnnouncement } from "@/lib/api/xvm-api"

export const DELETE = withRateLimit<{ params: Promise<{ id: string }> }>(
  async (request, context) => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const { id } = await context!.params
    if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })

    try {
      await deleteAnnouncement(token, Number(id))
      return NextResponse.json({ success: true })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[announcements] delete error")
    }
  },
  { requests: 20, window: "1 m" }
)
