import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { getMe, updateMyDisplayName } from "@/lib/api/xvm-api"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"

const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Display name is required")
    .max(50, "Display name too long (max 50 characters)"),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let displayName: string | null = null
  const token = await getValidXvmApiToken(session.user.id)
  if (token) {
    try {
      displayName = (await getMe(token)).person?.display_name ?? null
    } catch (err) {
      await xvmApiErrorResponse(err, session.user.id, "[user profile] GET error")
    }
  }
  return NextResponse.json({ id: session.user.id, displayName })
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  let parsed: z.infer<typeof profileSchema>
  try {
    parsed = profileSchema.parse(body)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
    }
    throw error
  }

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
  try {
    const { display_name } = await updateMyDisplayName(token, parsed.displayName)
    return NextResponse.json({ id: session.user.id, displayName: display_name })
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, "[user profile] PATCH error")
  }
}
