import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { withVenueAction } from "@/lib/api/venue-action"
import { getShiftSettings, updateShiftSettings } from "@/lib/api/xvm-api"

const updateShiftSettingsSchema = z.object({
  enabled: z.boolean(),
})

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    const { venueId } = await context.params

    return withVenueAction(venueId, "shift-settings GET", async (token, xvmApiVenueId) => {
      const settings = await getShiftSettings(token, xvmApiVenueId)
      return NextResponse.json({ autoApprove: !settings.approval_required })
    })
  },
  { requests: 60, window: "1 m" }
)

export const PATCH = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    const { venueId } = await context.params

    return withVenueAction(venueId, "shift-settings PATCH", async (token, xvmApiVenueId) => {
      const parsed = updateShiftSettingsSchema.safeParse(await request.json().catch(() => null))
      if (!parsed.success) {
        return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 })
      }

      const settings = await updateShiftSettings(
        token,
        xvmApiVenueId,
        { approval_required: !parsed.data.enabled },
        { approvePending: parsed.data.enabled }
      )
      return NextResponse.json({ autoApprove: !settings.approval_required })
    })
  },
  { requests: 10, window: "1 m" }
)
