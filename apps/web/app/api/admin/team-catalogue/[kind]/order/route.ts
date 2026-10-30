import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { reorderTeamCatalogue } from "@/lib/api/xvm-api"
import { refreshTeamPage } from "@/lib/refresh-team"
import { parseKind, type CatalogueContext } from "../../catalogue"

const orderSchema = z
  .object({
    ids: z
      .array(z.number().int().positive())
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .strict()

export const PUT = withRateLimit<CatalogueContext>(
  async (request: NextRequest, context) => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const kind = parseKind((await context!.params).kind)
    if (!kind) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const parsed = orderSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 })
    }

    try {
      const items = await reorderTeamCatalogue(token, kind, parsed.data.ids)
      refreshTeamPage()
      return NextResponse.json(items)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[admin/team-catalogue] reorder error")
    }
  },
  { requests: 30, window: "1 m" }
)
