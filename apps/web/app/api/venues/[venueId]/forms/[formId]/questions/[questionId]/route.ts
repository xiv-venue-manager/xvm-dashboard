import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { deleteFormQuestion, updateFormQuestion } from "@/lib/api/xvm-api"
import { questionUpdateSchema } from "@/lib/forms"

function parseId(value: string) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; formId: string; questionId: string }> }>(
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

    const { venueId, formId, questionId } = await context.params
    const formNum = parseId(formId)
    if (formNum === null) {
      return NextResponse.json({ error: "Invalid form id" }, { status: 400 })
    }
    const questionNum = parseId(questionId)
    if (questionNum === null) {
      return NextResponse.json({ error: "Invalid question id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[forms] /me/venues read error")
    if (!lookup.ok) return lookup.response

    let data: z.infer<typeof questionUpdateSchema>
    try {
      data = questionUpdateSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      return NextResponse.json(
        await updateFormQuestion(token, lookup.venue.id, formNum, questionNum, {
          ...(data.prompt !== undefined && { prompt: data.prompt }),
          ...(data.questionType !== undefined && { question_type: data.questionType }),
          ...(data.required !== undefined && { required: data.required }),
          ...(data.sortOrder !== undefined && { sort_order: data.sortOrder }),
          ...(data.options !== undefined && { options: data.options }),
        })
      )
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[forms/:id/questions/:id] PATCH error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; formId: string; questionId: string }> }>(
  async (_request, context) => {
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

    const { venueId, formId, questionId } = await context.params
    const formNum = parseId(formId)
    if (formNum === null) {
      return NextResponse.json({ error: "Invalid form id" }, { status: 400 })
    }
    const questionNum = parseId(questionId)
    if (questionNum === null) {
      return NextResponse.json({ error: "Invalid question id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[forms] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      await deleteFormQuestion(token, lookup.venue.id, formNum, questionNum)
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[forms/:id/questions/:id] DELETE error")
    }
  },
  { requests: 30, window: "1 m" }
)
