import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { createShout, listShouts } from "@/lib/api/xvm-api"
import { toShoutShape } from "@/lib/api/shout-shape"

const SHOUT_ORIGIN = "https://shout.xivvenuemanager.com"

const shoutSchema = z.object({
  label: z.string().trim().min(1),
  fields: z.record(z.string(), z.unknown()),
  templateId: z.string().min(1),
  separatorId: z.string().min(1).optional(),
  decorId: z.string().min(1).optional(),
})

function cors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", SHOUT_ORIGIN)
  res.headers.set("Access-Control-Allow-Credentials", "true")
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
  res.headers.set("Access-Control-Allow-Headers", "Content-Type")
  return res
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }))
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return cors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) return cors(NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 }))

  try {
    const shouts = await listShouts(token)
    return cors(NextResponse.json(shouts.map(toShoutShape)))
  } catch (err) {
    return cors(await xvmApiErrorResponse(err, session.user.id, "[shouts] list error"))
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return cors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) return cors(NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 }))

  const parsed = shoutSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return cors(NextResponse.json({ error: "Missing required fields." }, { status: 400 }))
  const { label, fields, templateId, separatorId, decorId } = parsed.data

  try {
    const shout = await createShout(token, {
      label,
      fields,
      template_id: templateId,
      separator_id: separatorId,
      decor_id: decorId,
    })
    return cors(NextResponse.json(toShoutShape(shout), { status: 201 }))
  } catch (err) {
    return cors(await xvmApiErrorResponse(err, session.user.id, "[shouts] create error"))
  }
}
