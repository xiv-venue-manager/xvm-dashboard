import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { NextResponse } from "next/server"
import { listMyNotifications, markNotificationsRead } from "@/lib/api/xvm-api"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { toBellNotification } from "@/lib/api/notification-shape"

const markReadSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1).optional(),
})

/** GET — fetch latest 30 notifications + unread count */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

  try {
    const inbox = await listMyNotifications(token, 30)
    return NextResponse.json({
      notifications: inbox.notifications.map(toBellNotification),
      unreadCount: inbox.unread_count,
    })
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, "[notifications GET] xvm-api error")
  }
}

/** PATCH — mark all (or specific IDs) as read */
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed = markReadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 })
  }

  const token = await getValidXvmApiToken(session.user.id)
  if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

  try {
    await markNotificationsRead(token, parsed.data.ids)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return xvmApiErrorResponse(err, session.user.id, "[notifications PATCH] xvm-api error")
  }
}
