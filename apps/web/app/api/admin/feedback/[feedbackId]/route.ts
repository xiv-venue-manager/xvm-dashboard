import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { validators } from "@/lib/validation"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { triageFeedback } from "@/lib/api/xvm-api"
import { toAdminFeedbackShape, toXvmFeedbackValue } from "@/lib/api/feedback-shape"

const updateSchema = z.object({
  status: validators.feedbackStatus.optional(),
  adminNotes: validators.adminNotes,
})

// PATCH /api/admin/feedback/[feedbackId] - Update feedback status/notes (admin only, enforced by xvm-api's platform_admin scope)
export const PATCH = withRateLimit<{ params: Promise<{ feedbackId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { feedbackId } = await context.params
    if (!/^\d+$/.test(feedbackId)) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const parsed = updateSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 })
    }
    const { status, adminNotes } = parsed.data

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    try {
      const updated = await triageFeedback(token, Number(feedbackId), {
        status: status && toXvmFeedbackValue(status),
        admin_notes: adminNotes,
      })
      return NextResponse.json(toAdminFeedbackShape(updated))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[admin feedback] triage error")
    }
  },
  { requests: 30, window: "1 m" }
)
