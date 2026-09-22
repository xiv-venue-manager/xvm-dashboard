import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listReactionRoleTemplates } from "@/lib/api/xvm-api"

// venueId in the URL is unused - xvm-api's template catalog is flat and
// platform-wide, not venue-scoped - but the route lives under the venue
// path for URL consistency with the rest of this feature's dashboard routes.
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

    try {
      const templates = await listReactionRoleTemplates(token)
      return NextResponse.json(templates)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[reaction-role-panels/templates] GET error")
    }
  },
  { requests: 30, window: "1 m" }
)
