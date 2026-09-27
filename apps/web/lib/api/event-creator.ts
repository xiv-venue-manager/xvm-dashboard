import { listMemberships, type EventRow } from "@/lib/api/xvm-api"

export async function creatorNameOf(token: string, xvmApiVenueId: string, event: EventRow): Promise<string | null> {
  if (event.created_by_person_id === null) return null
  try {
    const memberships = await listMemberships(token, xvmApiVenueId)
    return memberships.find((m) => m.person.id === event.created_by_person_id)?.person.display_name ?? null
  } catch (err) {
    console.error("[events] creator lookup error:", err)
    return null
  }
}
