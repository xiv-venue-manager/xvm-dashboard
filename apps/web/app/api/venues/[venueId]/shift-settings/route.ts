import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { withVenueAction } from "@/lib/api/venue-action"
import { getShiftSettings, updateShiftSettings, type ShiftSettingsRow } from "@/lib/api/xvm-api"

const updateShiftSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    qualificationRequired: z.boolean().optional(),
  })
  .refine((body) => body.enabled !== undefined || body.qualificationRequired !== undefined)

function view(settings: ShiftSettingsRow) {
  return { autoApprove: !settings.approval_required, qualificationRequired: settings.qualification_required }
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    const { venueId } = await context.params

    return withVenueAction(venueId, "shift-settings GET", async (token, xvmApiVenueId) => {
      return NextResponse.json(view(await getShiftSettings(token, xvmApiVenueId)))
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

      const { enabled, qualificationRequired } = parsed.data
      const settings = await updateShiftSettings(
        token,
        xvmApiVenueId,
        {
          ...(enabled !== undefined && { approval_required: !enabled }),
          ...(qualificationRequired !== undefined && { qualification_required: qualificationRequired }),
        },
        { approvePending: enabled === true }
      )
      return NextResponse.json(view(settings))
    })
  },
  { requests: 10, window: "1 m" }
)
