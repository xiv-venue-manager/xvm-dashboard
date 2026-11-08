import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { validators } from "@/lib/validation"

async function requireAdmin(session: any) {
  if (!session?.user?.id) return false
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  })
  return user?.isAdmin ?? false
}

const createSchema = z.object({
  title: z.string().min(1).max(100),
  message: z.string().min(1).max(2000),
  link: validators.url.nullable(),
  linkLabel: z.string().max(50).optional().nullable(),
  expiresAt: z.string().optional().nullable(),
})

export const GET = withRateLimit(
  async (request: NextRequest) => {
    try {
      const session = await getServerSession(authOptions)
      if (!(await requireAdmin(session))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }

      const announcements = await prisma.announcement.findMany({
        include: {
          author: { select: { name: true } },
          _count: { select: { dismissals: true } },
        },
        orderBy: { createdAt: "desc" },
      })

      return NextResponse.json(announcements)
    } catch (error) {
      console.error("Error fetching announcements:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 60, window: "1 m" }
)

export const POST = withRateLimit(
  async (request: NextRequest) => {
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id || !(await requireAdmin(session))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }

      const body = await request.json()
      const data = createSchema.parse(body)

      const announcement = await prisma.announcement.create({
        data: {
          title: data.title,
          message: data.message,
          link: data.link ?? null,
          linkLabel: data.linkLabel ?? null,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
          createdBy: session.user.id,
        },
      })

      return NextResponse.json(announcement, { status: 201 })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 })
      }
      console.error("Error creating announcement:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 20, window: "1 m" }
)
