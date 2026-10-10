import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { listMyCredentials, revokeCredential } from "@/lib/api/xvm-api"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"

export async function DELETE(_request: NextRequest, context: { params: Promise<{ credentialId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { credentialId } = await context.params
  const id = Number(credentialId)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid credential id" }, { status: 400 })

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

  try {
    const credentials = await listMyCredentials(token)
    if (!credentials.some((c) => c.id === id && c.client === "plugin")) {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 })
    }
    await revokeCredential(token, id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, "[plugin credentials] revoke error")
  }
}
