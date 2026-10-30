import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { removeTeamCatalogueItem, renameTeamCatalogueItem } from "@/lib/api/xvm-api"
import { refreshTeamPage } from "@/lib/refresh-team"
import { catalogueNameSchema, parseKind } from "../../catalogue"

type Context = { params: Promise<{ kind: string; id: string }> }

export const PATCH = withRateLimit<Context>(
  async (request: NextRequest, context) => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const { kind: rawKind, id } = await context!.params
    const kind = parseKind(rawKind)
    if (!kind || !/^\d+$/.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const parsed = catalogueNameSchema(kind).safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 })
    }

    try {
      const item = await renameTeamCatalogueItem(token, kind, Number(id), parsed.data.name)
      refreshTeamPage()
      return NextResponse.json(item)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[admin/team-catalogue] rename error")
    }
  },
  { requests: 30, window: "1 m" }
)

export const DELETE = withRateLimit<Context>(
  async (_request, context) => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const { kind: rawKind, id } = await context!.params
    const kind = parseKind(rawKind)
    if (!kind || !/^\d+$/.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })

    try {
      await removeTeamCatalogueItem(token, kind, Number(id))
      refreshTeamPage()
      return NextResponse.json({ success: true })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[admin/team-catalogue] remove error")
    }
  },
  { requests: 20, window: "1 m" }
)
