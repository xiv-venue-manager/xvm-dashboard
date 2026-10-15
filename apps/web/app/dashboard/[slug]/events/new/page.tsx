import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { resolveMyVenue } from "@/lib/api/venue-access"
import { canManageVenue } from "@/lib/roles"
import { xvmPageReader } from "@/lib/api/xvm-page-read"
import { getVenue } from "@/lib/api/xvm-api"
import { NewEventForm } from "@/components/new-event-form"

export default async function NewEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug } = await params

  const venue = await resolveMyVenue(session.user.id, slug)
  if (!venue) notFound()
  if (!canManageVenue(venue.role)) redirect(`/dashboard/${slug}/events`)

  const readXvm = await xvmPageReader(session.user.id, venue.id)
  const hasPartake = await readXvm("new-event partake link", false, async (token, xvmApiVenueId) =>
    (await getVenue(token, xvmApiVenueId)).external_links.some(
      (link) => link.provider === "Partake" && link.unlinked_at === null
    )
  )

  return <NewEventForm slug={slug} venueId={venue.id} hasPartake={hasPartake} />
}
