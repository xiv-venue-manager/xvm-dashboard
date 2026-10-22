import { NextResponse } from "next/server"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { requirePlatformAdmin } from "@/lib/admin-access"
import { xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { createReactionRoleTemplate, listReactionRoleTemplates } from "@/lib/api/xvm-api"
import { templateCreateSchema } from "@/lib/api/reaction-role-template-input"

export const GET = withRateLimit(
  async () => {
    const gate = await requirePlatformAdmin()
    if (gate.error) return gate.error

    try {
      return NextResponse.json(await listReactionRoleTemplates(gate.token))
    } catch (err) {
      return xvmApiErrorResponse(err, gate.userId, "[admin/reaction-role-templates] GET error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const POST = withRateLimit(
  async (request) => {
    const gate = await requirePlatformAdmin()
    if (gate.error) return gate.error

    let data: z.infer<typeof templateCreateSchema>
    try {
      data = templateCreateSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: err.issues }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      return NextResponse.json(await createReactionRoleTemplate(gate.token, data), { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, gate.userId, "[admin/reaction-role-templates] POST error")
    }
  },
  { requests: 20, window: "1 m" }
)
