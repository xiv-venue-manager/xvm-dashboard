import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma/client"
import { getMe, updateMyDisplayName } from "@/lib/api/xvm-api"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"

const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Display name is required")
    .max(50, "Display name too long (max 50 characters)")
    .optional(),
  notifications: z
    .object({
      newFollower: z.boolean().optional(),
      eventRsvp: z.boolean().optional(),
      lowStaffCoverage: z.boolean().optional(),
      dailySummary: z.boolean().optional(),
    })
    .optional(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, settings: true },
  })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  try {
    const me = await getMe(token)
    return NextResponse.json({ ...user, displayName: me.person?.display_name ?? null })
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, "[user profile] GET error")
  }
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

  let displayName: string | undefined
  if (parsed.displayName !== undefined) {
    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    try {
      displayName = (await updateMyDisplayName(token, parsed.displayName)).display_name
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[user profile] PATCH error")
    }
  }

  const existingUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { settings: true },
  })
  let settings = existingUser?.settings ?? null
  if (parsed.notifications !== undefined) {
    const currentSettings = (existingUser?.settings as Record<string, unknown>) ?? {}
    settings = (
      await prisma.user.update({
        where: { id: session.user.id },
        data: { settings: { ...currentSettings, notifications: parsed.notifications } as Prisma.InputJsonValue },
        select: { settings: true },
      })
    ).settings
  }

  return NextResponse.json({ id: session.user.id, displayName, settings })
}
