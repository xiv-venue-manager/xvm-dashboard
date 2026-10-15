import { getValidXvmApiToken, invalidateXvmApiCredential, isXvmAuthFailure } from "@/lib/api/xvm-api-store"
import { getVenue, type EventVisibility } from "@/lib/api/xvm-api"

export async function eventVisibilityFor(userId: string, xvmApiVenueId: string): Promise<EventVisibility> {
  const token = await getValidXvmApiToken(userId)
  if (!token) return "published"
  try {
    return (await getVenue(token, xvmApiVenueId)).event_visibility
  } catch (err) {
    console.error("[events] event visibility error:", err)
    if (isXvmAuthFailure(err)) await invalidateXvmApiCredential(userId)
    return "published"
  }
}

export async function eventHiddenFromStaff(
  userId: string,
  role: string,
  xvmApiVenueId: string,
  eventStatus: string
): Promise<boolean> {
  if (role !== "STAFF" || eventStatus === "PUBLISHED") return false
  return (await eventVisibilityFor(userId, xvmApiVenueId)) === "published"
}
