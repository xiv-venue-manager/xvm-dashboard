import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { listMyCredentials } from "@/lib/api/xvm-api"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

  try {
    const credentials = await listMyCredentials(token)
    return NextResponse.json({
      credentials: credentials
        .filter((c) => c.client === "plugin" && c.revoked_at === null)
        .map((c) => ({
          id: c.id,
          name: c.name,
          preview: c.preview,
          venueId: c.venue_id,
          issuedAt: c.issued_at,
          lastUsedAt: c.last_used_at,
        })),
    })
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, "[plugin credentials] list error")
  }
}
