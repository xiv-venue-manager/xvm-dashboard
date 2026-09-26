import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { reclassifyPatronLogs } from "@/lib/api/xvm-api"

const numericId = z.string().regex(/^\d+$/, "Invalid id")

const bulkReclassifySchema = z
  .object({
    logIds: z.array(numericId).min(1).max(500),
    wasWorking: z.boolean(),
    workingUserId: numericId.nullable(),
    reason: z.string().max(500).optional(),
  })
  .refine((d) => !d.wasWorking || !!d.workingUserId, {
    message: "workingUserId is required when wasWorking is true",
    path: ["workingUserId"],
  })

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request, context) => {
    if (!context?.params) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = await getValidXvmApiToken(session.user.id)
    if (!token) {
      return NextResponse.json({ error: "xvm-api link not established yet" }, { status: 503 })
    }

    const { venueId } = await context.params

    const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { xvmApiVenueId: true } })
    if (!venue?.xvmApiVenueId) {
      return NextResponse.json(
        { error: "not_connected", message: "This venue hasn't been connected to xvm-api yet." },
        { status: 409 }
      )
    }

    let data: z.infer<typeof bulkReclassifySchema>
    try {
      data = bulkReclassifySchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const result = await reclassifyPatronLogs(token, venue.xvmApiVenueId, {
        log_ids: data.logIds.map(Number),
        was_working: data.wasWorking,
        working_person_id: data.wasWorking && data.workingUserId ? Number(data.workingUserId) : null,
        reason: data.reason ?? null,
      })
      return NextResponse.json({ updated: result.updated })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[bulk-reclassify] error")
    }
  },
  { requests: 30, window: "1 m" }
)
