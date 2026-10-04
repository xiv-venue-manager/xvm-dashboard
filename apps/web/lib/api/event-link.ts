interface LinkableEvent {
  id: string | null
  recurrenceRuleId: number | null
  scheduledAt: string | null
}

export function eventHref(
  target: { slug: string; venueId: string; canMaterialize: boolean },
  event: LinkableEvent,
  to?: "edit"
): string | null {
  const suffix = to === "edit" ? "/edit" : ""
  if (event.id !== null) return `/dashboard/${target.slug}/events/${event.id}${suffix}`
  if (!target.canMaterialize || event.recurrenceRuleId === null || event.scheduledAt === null) return null
  const query = new URLSearchParams({ rule: String(event.recurrenceRuleId), at: event.scheduledAt })
  if (to) query.set("to", to)
  return `/api/venues/${target.venueId}/events/occurrence?${query}`
}
