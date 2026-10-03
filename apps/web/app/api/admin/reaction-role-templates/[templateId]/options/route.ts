import { NextResponse } from "next/server"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { requirePlatformAdmin } from "@/lib/admin-access"
import { xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { addReactionRoleTemplateOption } from "@/lib/api/xvm-api"
import { templateOptionCreateSchema } from "@/lib/api/reaction-role-template-input"

type Ctx = { params: Promise<{ templateId: string }> }

export const POST = withRateLimit<Ctx>(
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const gate = await requirePlatformAdmin()
    if (gate.error) return gate.error

    const templateId = Number((await context.params).templateId)
    if (!Number.isInteger(templateId)) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    let data: z.infer<typeof templateOptionCreateSchema>
    try {
      data = templateOptionCreateSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: err.issues }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const option = await addReactionRoleTemplateOption(gate.token, templateId, data)
      return NextResponse.json(option, { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, gate.userId, "[admin/reaction-role-templates/:id/options] POST error")
    }
  },
  { requests: 30, window: "1 m" }
)
