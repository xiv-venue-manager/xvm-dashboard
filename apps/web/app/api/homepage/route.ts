import { NextResponse } from "next/server"
import { getPublicStats } from "@/lib/public-stats"

const VALID_API_KEY = process.env.HOMEPAGE_API_KEY

function authenticate(request: Request): boolean {
  if (!VALID_API_KEY) return false
  const apiKey = request.headers.get("X-API-Key")
  return apiKey === VALID_API_KEY
}

export async function GET(request: Request) {
  if (!authenticate(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Access-Control-Allow-Origin": "*" } }
    )
  }

  let s
  try {
    s = await getPublicStats()
  } catch (error) {
    console.error("Homepage stats error:", error)
    return NextResponse.json(
      { error: "Stats unavailable" },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
    )
  }

  const response = NextResponse.json({
    totalVenues: s.venuesTotal,
    venuesActive30d: s.venuesActive30d,
    totalEvents: s.eventsTotal,
    partakeEventsSynced: s.partakeEventsSynced,
    totalTransactions: s.salesTotal,
    gilTracked: s.gilTracked,
    pluginInstalls: s.pluginInstalls,
    patronEntries: s.patronEntriesTotal,
    dataCenters: s.dataCenters,
    lastUpdated: s.generatedAt,
  })
  response.headers.set("Cache-Control", "public, s-maxage=60")
  response.headers.set("Access-Control-Allow-Origin", "*")

  return response
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "X-API-Key",
    },
  })
}
