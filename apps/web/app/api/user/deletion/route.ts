import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, invalidateXvmApiCredential, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requestAccountDeletion, type AccountDeletion } from "@/lib/api/xvm-api"

// DELETE /api/user/deletion - Ask xvm-api to delete the signed-in person's account (30 day grace period)
export const DELETE = withRateLimit(
  async () => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json(
        { error: "xvm-api link not established yet. Sign out and back in, then try again." },
        { status: 503 }
      )
    }

    let deletion: AccountDeletion
    try {
      deletion = await requestAccountDeletion(token)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[account deletion] request error")
    }

    await invalidateXvmApiCredential(session.user.id).catch((err: unknown) => {
      console.error("[account deletion] could not clear the stored credential:", err)
    })
    return NextResponse.json({ anonymisesAt: deletion.anonymises_at })
  },
  { requests: 5, window: "1 m" }
)
