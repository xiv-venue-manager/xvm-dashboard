import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { unlinkMyCharacter } from "@/lib/api/xvm-api"

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

  try {
    await unlinkMyCharacter(token, Number(id))
    return NextResponse.json({ success: true })
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, "[user-characters DELETE] xvm-api error")
  }
}
