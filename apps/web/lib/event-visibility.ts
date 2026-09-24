import { getValidXvmApiToken, invalidateXvmApiCredential, isXvmAuthFailure } from "@/lib/api/xvm-api-store"
import { getVenue, type EventVisibility } from "@/lib/api/xvm-api"

export async function eventVisibilityFor(
  userId: string,
  venue: { settings: unknown; xvmApiVenueId: string | null } | null
): Promise<EventVisibility> {
  if (!venue?.xvmApiVenueId) {
    return (venue?.settings as Record<string, unknown> | null)?.eventVisibility === "published" ? "published" : "all"
  }
  const token = await getValidXvmApiToken(userId)
  if (!token) return "published"
  try {
    return (await getVenue(token, venue.xvmApiVenueId)).event_visibility
  } catch (err) {
    console.error("[events] event visibility error:", err)
    if (isXvmAuthFailure(err)) await invalidateXvmApiCredential(userId)
    return "published"
  }
}

export async function eventHiddenFromStaff(
  userId: string,
  role: string,
  venue: { settings: unknown; xvmApiVenueId: string | null } | null,
  eventStatus: string
): Promise<boolean> {
  if (role !== "STAFF" || eventStatus === "PUBLISHED") return false
  return (await eventVisibilityFor(userId, venue)) === "published"
}
