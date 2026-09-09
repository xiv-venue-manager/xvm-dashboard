import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { updateFinanceCategory, deleteFinanceCategory } from "@/lib/api/xvm-api"

const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(50).optional(),
    sort_order: z.number().int().min(0).optional(),
    applies_to: z.enum(["revenue", "expense", "payout"]).nullable().optional(),
  })
  .strict()

async function requireXvmVenueId(venueId: string) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
  if (!venue?.xvmApiVenueId) {
    return {
      error: NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      ),
    }
  }
  return { xvmApiVenueId: venue.xvmApiVenueId }
}

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string; categoryId: string }> }>(
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, categoryId } = await context.params
    const categoryIdNum = Number(categoryId)
    if (!Number.isInteger(categoryIdNum) || categoryIdNum <= 0) {
      return NextResponse.json({ error: "Invalid category id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof updateCategorySchema>
    try {
      data = updateCategorySchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const category = await updateFinanceCategory(token, gate.xvmApiVenueId!, categoryIdNum, data)
      return NextResponse.json(category)
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[finance-categories] PATCH error")
    }
  },
  { requests: 20, window: "1 m" }
)

export const DELETE = withRateLimit<{ params: Promise<{ venueId: string; categoryId: string }> }>(
  async (request, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId, categoryId } = await context.params
    const categoryIdNum = Number(categoryId)
    if (!Number.isInteger(categoryIdNum) || categoryIdNum <= 0) {
      return NextResponse.json({ error: "Invalid category id" }, { status: 400 })
    }

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      await deleteFinanceCategory(token, gate.xvmApiVenueId!, categoryIdNum)
      return new NextResponse(null, { status: 204 })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[finance-categories] DELETE error")
    }
  },
  { requests: 20, window: "1 m" }
)
