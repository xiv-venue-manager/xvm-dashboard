import { NextResponse } from "next/server"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"
import { getPublicStats } from "@/lib/public-stats"

export const GET = withRateLimit(
  async () => {
    try {
      const stats = await getPublicStats()
      return NextResponse.json(stats, {
        headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
      })
    } catch (error) {
      console.error("Public stats error:", error)
      return NextResponse.json({ error: "Stats unavailable" }, { status: 500 })
    }
  },
  { requests: 60, window: "1 m" }
)
