import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { createFormQuestion } from "@/lib/api/xvm-api"
import { questionCreateSchema } from "@/lib/forms"

function parseId(value: string) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export const POST = withRateLimit<{ params: Promise<{ venueId: string; formId: string }> }>(
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

    const { venueId, formId } = await context.params
    const formNum = parseId(formId)
    if (formNum === null) {
      return NextResponse.json({ error: "Invalid form id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[forms] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof questionCreateSchema>
    try {
      data = questionCreateSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      return NextResponse.json(
        await createFormQuestion(token, lookup.venue.id, formNum, {
          prompt: data.prompt,
          ...(data.questionType !== undefined && { question_type: data.questionType }),
          ...(data.required !== undefined && { required: data.required }),
        }),
        { status: 201 }
      )
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[forms/:id/questions] POST error")
    }
  },
  { requests: 60, window: "1 m" }
)
