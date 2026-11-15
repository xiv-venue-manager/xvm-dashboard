import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { requireMyVenue } from "@/lib/api/venue-access"
import { deleteForm, listForms, updateForm, type FormUpdate } from "@/lib/api/xvm-api"
import { requireChannelInGuild } from "@/lib/api/venue-guild"
import { formUpdateSchema } from "@/lib/forms"

function parseId(value: string) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; formId: string }> }>(
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

    let data: z.infer<typeof formUpdateSchema>
    try {
      data = formUpdateSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    if (data.responseChannelId) {
      let current: string | null = null
      try {
        current =
          (await listForms(token, lookup.venue.id)).find((form) => form.id === formNum)?.response_channel_id ?? null
      } catch (err) {
        return xvmApiErrorResponse(err, session.user.id, "[forms/:id] PATCH error")
      }
      if (data.responseChannelId !== current) {
        const channel = await requireChannelInGuild(session.user.id, venueId, data.responseChannelId)
        if (!channel.ok) return channel.response
      }
    }

    try {
      const update: FormUpdate = {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.prePrompt !== undefined && { pre_prompt: data.prePrompt }),
        ...(data.postPrompt !== undefined && { post_prompt: data.postPrompt }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.buttonLabel !== undefined && { button_label: data.buttonLabel }),
        ...(data.buttonEmoji !== undefined && { button_emoji: data.buttonEmoji }),
        ...(data.allowMultipleResponses !== undefined && { allow_multiple_responses: data.allowMultipleResponses }),
        ...(data.responseChannelId !== undefined && { response_channel_id: data.responseChannelId }),
      }
      return NextResponse.json(await updateForm(token, lookup.venue.id, formNum, update))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[forms/:id] PATCH error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; formId: string }> }>(
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

    const { venueId, formId } = await context.params
    const formNum = parseId(formId)
    if (formNum === null) {
      return NextResponse.json({ error: "Invalid form id" }, { status: 400 })
    }

    const lookup = await requireMyVenue(session.user.id, venueId, "[forms] /me/venues read error")
    if (!lookup.ok) return lookup.response

    try {
      await deleteForm(token, lookup.venue.id, formNum)
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[forms/:id] DELETE error")
    }
  },
  { requests: 30, window: "1 m" }
)
