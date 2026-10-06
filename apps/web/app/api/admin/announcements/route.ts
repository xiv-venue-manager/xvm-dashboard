import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { validators } from "@/lib/validation"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { createAnnouncement, listAnnouncements } from "@/lib/api/xvm-api"
import { toAnnouncementShape } from "@/lib/api/announcement-shape"

const createSchema = z.object({
  title: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
  link: validators.url.nullable(),
  linkLabel: z.string().max(50).optional().nullable(),
  expiresAt: z
    .string()
    .optional()
    .nullable()
    .refine((value) => !value || !Number.isNaN(new Date(value).getTime()), "Invalid expiry date"),
})

export const GET = withRateLimit(
  async () => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    try {
      const announcements = await listAnnouncements(token)
      return NextResponse.json(announcements.map(toAnnouncementShape))
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[announcements] list error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const POST = withRateLimit(
  async (request: NextRequest) => {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })

    const parsed = createSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 })
    }
    const data = parsed.data

    try {
      const announcement = await createAnnouncement(token, {
        title: data.title,
        message: data.message,
        link: data.link ?? null,
        link_label: data.linkLabel ?? null,
        expires_at: data.expiresAt ? new Date(data.expiresAt).toISOString() : null,
      })
      return NextResponse.json(toAnnouncementShape(announcement), { status: 201 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[announcements] create error")
    }
  },
  { requests: 20, window: "1 m" }
)
