const PARTAKE_API = "https://api.partake.gg/"
const USER_AGENT = "XIV-Venue-Manager/1.0"

const EVENTS_QUERY = `
  query getTimelineEvents($teamId: Int, $sortBy: EventSortType, $endsBetween: TimeRangeInput, $offset: Int, $limit: Int) {
    events(
      teamId: $teamId
      sortBy: $sortBy
      endsBetween: $endsBetween
      offset: $offset
      limit: $limit
    ) {
      id
      title
      description
      tags
      ageRating
      location
      locationData {
        server { name }
        dataCenter { name }
      }
      startsAt
      endsAt
      attendeeCount
      createdAt
      updatedAt
    }
  }
`

interface PartakeEvent {
  id: number
  title: string
  description: string | null
  tags: string[]
  ageRating: string
  location: string
  locationData: {
    server: { name: string }
    dataCenter: { name: string }
  }
  startsAt: string
  endsAt: string
  attendeeCount: number
  createdAt: string
  updatedAt: string
}

/**
 * Fetch upcoming events from Partake for a given team ID.
 */
export async function fetchPartakeEvents(teamId: number): Promise<PartakeEvent[]> {
  const res = await fetch(PARTAKE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({
      query: EVENTS_QUERY,
      variables: {
        teamId,
        sortBy: "ENDS_AT",
        endsBetween: { end: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString() },
        offset: 0,
        limit: 50,
      },
    }),
  })

  if (!res.ok) {
    throw new Error(`Partake API error: ${res.status}`)
  }

  const json = await res.json()
  return json.data?.events ?? []
}
