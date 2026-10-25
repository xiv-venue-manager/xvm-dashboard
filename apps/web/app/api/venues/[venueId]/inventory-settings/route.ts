import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { withVenueAction } from "@/lib/api/venue-action"
import { listModules, setModule, XvmApiError } from "@/lib/api/xvm-api"

const updateInventorySettingsSchema = z.object({
  enabled: z.boolean(),
})

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    const { venueId } = await context.params

    return withVenueAction(venueId, "inventory-settings GET", async (token, xvmApiVenueId) => {
      const modules = await listModules(token, xvmApiVenueId)
      const inventory = modules.find((m) => m.module === "inventory")
      return NextResponse.json({ settings: { enabled: inventory?.enabled ?? false } })
    })
  },
  { requests: 60, window: "1 m" }
)

export const PUT = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    const { venueId } = await context.params

    return withVenueAction(venueId, "inventory-settings PUT", async (token, xvmApiVenueId) => {
      const parsed = updateInventorySettingsSchema.safeParse(await request.json().catch(() => null))
      if (!parsed.success) {
        return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 })
      }

      try {
        const row = await setModule(token, xvmApiVenueId, "inventory", parsed.data.enabled)
        return NextResponse.json({ settings: { enabled: row.enabled } })
      } catch (err) {
        if (err instanceof XvmApiError && err.status === 403) {
          return NextResponse.json({ error: "Only owners and managers can change inventory settings" }, { status: 403 })
        }
        throw err
      }
    })
  },
  { requests: 10, window: "1 m" }
)
