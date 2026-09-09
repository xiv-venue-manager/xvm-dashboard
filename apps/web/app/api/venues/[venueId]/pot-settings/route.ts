import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getValidXvmApiToken, xvmApiErrorResponse } from "@/lib/api/xvm-api-store"
import { getFinanceSettings, updateFinanceSettings } from "@/lib/api/xvm-api"
import { percentToBasisPoints, basisPointsToPercent } from "@/lib/api/position-convert"

const updatePotSettingsSchema = z.object({
  taxPercent: z.number().min(0).max(100).optional(),
  includeSalesInPot: z.boolean().optional(),
  defaultTipPooled: z.boolean().optional(),
})

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

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
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

    const { venueId } = await context.params

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    try {
      const settings = await getFinanceSettings(token, gate.xvmApiVenueId!)
      return NextResponse.json({
        settings: {
          taxPercent: basisPointsToPercent(settings.tax_basis_points),
          includeSalesInPot: settings.include_sales_in_pot,
          defaultTipPooled: settings.default_tip_pooled,
        },
      })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[pot-settings] GET error")
    }
  },
  { requests: 60, window: "1 m" }
)

export const PUT = withRateLimit<{ params: Promise<{ venueId: string }> }>(
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

    const { venueId } = await context.params

    const gate = await requireXvmVenueId(venueId)
    if (gate.error) return gate.error

    let data: z.infer<typeof updatePotSettingsSchema>
    try {
      data = updatePotSettingsSchema.parse(await request.json())
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.flatten() }, { status: 400 })
      }
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    try {
      const settings = await updateFinanceSettings(token, gate.xvmApiVenueId!, {
        tax_basis_points: percentToBasisPoints(data.taxPercent ?? null) ?? undefined,
        include_sales_in_pot: data.includeSalesInPot,
        default_tip_pooled: data.defaultTipPooled,
      })
      return NextResponse.json({
        settings: {
          taxPercent: basisPointsToPercent(settings.tax_basis_points),
          includeSalesInPot: settings.include_sales_in_pot,
          defaultTipPooled: settings.default_tip_pooled,
        },
      })
    } catch (err) {
      return xvmApiErrorResponse(err, session.user.id, "[pot-settings] PUT error")
    }
  },
  { requests: 10, window: "1 m" }
)
