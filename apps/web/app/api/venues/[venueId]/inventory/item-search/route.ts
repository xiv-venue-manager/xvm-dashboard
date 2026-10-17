import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { atLeast, requireMyVenue } from "@/lib/api/venue-access"
import { withRateLimit } from "@/lib/middleware/with-rate-limit"

const XIVAPI_BASE_URL = process.env.XIVAPI_BASE_URL ?? "https://v2.xivapi.com"

interface XivApiSearchResult {
  row_id: number
  fields: {
    Name: string
    Icon?: { id?: number; path?: string }
  }
}

interface XivApiSearchResponse {
  results: XivApiSearchResult[]
}

export interface ItemSearchResult {
  itemId: number
  name: string
  iconId: number | null
}

export const GET = withRateLimit<{ params: Promise<{ venueId: string }> }>(
  async (request: NextRequest, context) => {
    if (!context?.params) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      const { venueId } = await context.params
      const lookup = await requireMyVenue(session.user.id, venueId, "[item-search] /me/venues read error")
      if (!lookup.ok) return lookup.response
      if (!atLeast(lookup.venue.role, "MANAGER")) {
        return NextResponse.json({ error: "Owner or Manager role required" }, { status: 403 })
      }

      const { searchParams } = new URL(request.url)
      const query = searchParams.get("query")?.trim()
      if (!query || query.length < 2) {
        return NextResponse.json({ error: "query must be at least 2 characters" }, { status: 400 })
      }

      const sanitizedQuery = query.replace(/"/g, "")
      const apiParams = new URLSearchParams({
        query: `Name~"${sanitizedQuery}"`,
        sheets: "Item",
        fields: "Name,Icon",
        limit: "20",
      })
      const res = await fetch(`${XIVAPI_BASE_URL}/api/search?${apiParams.toString()}`)
      if (!res.ok) {
        return NextResponse.json({ error: "XIVAPI request failed" }, { status: 502 })
      }

      const data: XivApiSearchResponse = await res.json()
      const items: ItemSearchResult[] = (data.results ?? []).map((r) => ({
        itemId: r.row_id,
        name: r.fields.Name,
        iconId: r.fields.Icon?.id ?? null,
      }))

      return NextResponse.json({ items })
    } catch (error) {
      console.error("Error searching XIVAPI:", error)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  },
  { requests: 20, window: "1 m" }
)
