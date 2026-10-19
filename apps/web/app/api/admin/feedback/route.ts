import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { validators } from "@/lib/validation"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listAdminFeedback } from "@/lib/api/xvm-api"
import { toAdminFeedbackShape, toXvmFeedbackValue } from "@/lib/api/feedback-shape"

const querySchema = z.object({
  status: validators.feedbackStatus.optional(),
  category: validators.feedbackCategory.optional(),
})

// GET /api/admin/feedback - List all feedback (admin only, enforced by xvm-api's platform_admin scope)
export const GET = withRateLimit(
  async (request: NextRequest) => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const queryResult = querySchema.safeParse({
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      category: request.nextUrl.searchParams.get("category") ?? undefined,
    })
    if (!queryResult.success) {
      return NextResponse.json({ error: "Invalid query parameters", details: queryResult.error.issues }, { status: 400 })
    }
    const { status, category } = queryResult.data

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    try {
      const feedback = await listAdminFeedback(token, {
        status: status && toXvmFeedbackValue(status),
        category: category && toXvmFeedbackValue(category),
      })
      return NextResponse.json(feedback.map(toAdminFeedbackShape))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[admin feedback] list error")
    }
  },
  { requests: 60, window: "1 m" }
)
