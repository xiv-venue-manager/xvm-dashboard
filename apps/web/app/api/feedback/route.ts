import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { sendDiscordWebhook, formatFeedbackSubmittedEmbed } from "@/lib/discord-webhook"
import { validators } from "@/lib/validation"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { listMyFeedback, submitFeedback } from "@/lib/api/xvm-api"
import { toFeedbackShape, toXvmFeedbackValue } from "@/lib/api/feedback-shape"

const MAX_USER_AGENT_LENGTH = 300

const feedbackSchema = z.object({
  category: validators.feedbackCategory,
  subject: validators.feedbackSubject,
  description: validators.feedbackDescription,
  url: validators.url,
})

const SHOUT_ORIGIN = "https://shout.xivvenuemanager.com"

function addCors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", SHOUT_ORIGIN)
  res.headers.set("Access-Control-Allow-Credentials", "true")
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.headers.set("Access-Control-Allow-Headers", "Content-Type")
  return res
}

export async function OPTIONS() {
  return addCors(new NextResponse(null, { status: 204 }))
}

// POST /api/feedback - Submit new feedback
export const POST = withRateLimit(
  async (request: NextRequest) => {
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return addCors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      }

      const token = await getValidXvmApiToken(session.user.id)
      if (!token) {
        return addCors(NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 }))
      }

      const body = await request.json()
      let parsed: z.infer<typeof feedbackSchema>
      try {
        parsed = feedbackSchema.parse(body)
      } catch (error) {
        if (error instanceof z.ZodError) {
          return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
        }
        throw error
      }
      const { category, subject, description, url } = parsed

      const userAgent = request.headers.get("user-agent")?.slice(0, MAX_USER_AGENT_LENGTH)

      let feedback
      try {
        feedback = toFeedbackShape(
          await submitFeedback(token, {
            category: toXvmFeedbackValue(category),
            subject,
            description,
            url,
            user_agent: userAgent,
          })
        )
      } catch (err) {
        return addCors(await xvmApiErrorResponse(err, session.user.id, "[feedback] submit error"))
      }

      // Fire-and-forget Discord notification to admin channel.
      // Failures here must not break the user response.
      const adminWebhookUrl = process.env.FEEDBACK_DISCORD_WEBHOOK_URL
      if (adminWebhookUrl) {
        const embed = formatFeedbackSubmittedEmbed({
          category: feedback.category,
          subject: feedback.subject,
          description: feedback.description,
          url: feedback.url,
          user: { name: session.user.name, email: session.user.email },
        })
        void sendDiscordWebhook(adminWebhookUrl, { embeds: [embed] }).catch((err) => {
          console.error("[feedback] Discord notify failed:", err)
        })
      }

      return addCors(NextResponse.json(feedback, { status: 201 }))
    } catch (error) {
      console.error("Error creating feedback:", error)
      return addCors(NextResponse.json({ error: "Internal server error" }, { status: 500 }))
    }
  },
  { requests: 5, window: "1 m" }
)

// GET /api/feedback - List current user's own feedback only
export const GET = withRateLimit(
  async () => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    try {
      return NextResponse.json((await listMyFeedback(token)).map(toFeedbackShape))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[feedback] list error")
    }
  },
  { requests: 30, window: "1 m" }
)
