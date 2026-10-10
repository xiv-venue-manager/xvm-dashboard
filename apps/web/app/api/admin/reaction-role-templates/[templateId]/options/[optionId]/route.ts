import { NextResponse } from "next/server"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { requirePlatformAdmin } from "@/lib/admin-access"
import { xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { deleteReactionRoleTemplateOption, updateReactionRoleTemplateOption } from "@/lib/api/xvm-api"
import { templateOptionUpdateSchema } from "@/lib/api/reaction-role-template-input"

type Ctx = { params: Promise<{ templateId: string; optionId: string }> }

async function parseIds(context: Ctx) {
  const { templateId, optionId } = await context.params
  const template = Number(templateId)
  const option = Number(optionId)
  if (!Number.isInteger(template) || !Number.isInteger(option)) return null
  return { template, option }
}

export const PATCH = withRateLimit<Ctx>(
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const gate = await requirePlatformAdmin()
    if (gate.error) return gate.error

    const ids = await parseIds(context)
    if (!ids) return NextResponse.json({ error: "Option not found" }, { status: 404 })

    let data: z.infer<typeof templateOptionUpdateSchema>
    try {
      data = templateOptionUpdateSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: err.issues }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const option = await updateReactionRoleTemplateOption(gate.token, ids.template, ids.option, data)
      return NextResponse.json(option)
    } catch (err) {
      return xvmApiErrorResponse(err, gate.userId, "[admin/reaction-role-templates/:id/options/:id] PATCH error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const DELETE = withRateLimit<Ctx>(
  async (_request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const gate = await requirePlatformAdmin()
    if (gate.error) return gate.error

    const ids = await parseIds(context)
    if (!ids) return NextResponse.json({ error: "Option not found" }, { status: 404 })

    try {
      await deleteReactionRoleTemplateOption(gate.token, ids.template, ids.option)
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return xvmApiErrorResponse(err, gate.userId, "[admin/reaction-role-templates/:id/options/:id] DELETE error")
    }
  },
  { requests: 20, window: "1 m" }
)
