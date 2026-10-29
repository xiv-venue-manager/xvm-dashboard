import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { addTeamCatalogueItem, listTeamCatalogue } from "@/lib/api/xvm-api"
import { refreshTeamPage } from "@/lib/refresh-team"
import { catalogueNameSchema, parseKind, type CatalogueContext } from "../catalogue"

export const GET = withRateLimit<CatalogueContext>(
  async (_request, context) => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const kind = parseKind((await context!.params).kind)
    if (!kind) return NextResponse.json({ error: "Not found" }, { status: 404 })

    try {
      return NextResponse.json(await listTeamCatalogue(token, kind))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[admin/team-catalogue] list error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const POST = withRateLimit<CatalogueContext>(
  async (request: NextRequest, context) => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const kind = parseKind((await context!.params).kind)
    if (!kind) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const parsed = catalogueNameSchema(kind).safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 })
    }

    try {
      const item = await addTeamCatalogueItem(token, kind, parsed.data.name)
      refreshTeamPage()
      return NextResponse.json(item, { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[admin/team-catalogue] add error")
    }
  },
  { requests: 30, window: "1 m" }
)
