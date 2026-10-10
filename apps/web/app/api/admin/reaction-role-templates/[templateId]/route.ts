import { NextResponse } from "next/server"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { requirePlatformAdmin } from "@/lib/admin-access"
import { xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { deleteReactionRoleTemplate, updateReactionRoleTemplate } from "@/lib/api/xvm-api"
import { templateUpdateSchema } from "@/lib/api/reaction-role-template-input"

type Ctx = { params: Promise<{ templateId: string }> }

function parseTemplateId(raw: string) {
  const id = Number(raw)
  return Number.isInteger(id) ? id : null
}

export const PATCH = withRateLimit<Ctx>(
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const gate = await requirePlatformAdmin()
    if (gate.error) return gate.error

    const templateId = parseTemplateId((await context.params).templateId)
    if (templateId === null) return NextResponse.json({ error: "Template not found" }, { status: 404 })

    let data: z.infer<typeof templateUpdateSchema>
    try {
      data = templateUpdateSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: err.issues }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      return NextResponse.json(await updateReactionRoleTemplate(gate.token, templateId, data))
    } catch (err) {
      return xvmApiErrorResponse(err, gate.userId, "[admin/reaction-role-templates/:id] PATCH error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const DELETE = withRateLimit<Ctx>(
  async (_request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const gate = await requirePlatformAdmin()
    if (gate.error) return gate.error

    const templateId = parseTemplateId((await context.params).templateId)
    if (templateId === null) return NextResponse.json({ error: "Template not found" }, { status: 404 })

    try {
      await deleteReactionRoleTemplate(gate.token, templateId)
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return xvmApiErrorResponse(err, gate.userId, "[admin/reaction-role-templates/:id] DELETE error")
    }
  },
  { requests: 20, window: "1 m" }
)
