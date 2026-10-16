import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { resolveMyVenue } from "@/lib/api/venue-access"
import { EditEventForm } from "@/components/edit-event-form"

export default async function EditEventPage({ params }: { params: Promise<{ slug: string; eventId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug, eventId } = await params

  const venue = await resolveMyVenue(session.user.id, slug)
  if (!venue) notFound()

  return <EditEventForm slug={slug} venueId={venue.id} eventId={eventId} />
}
