import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { myVenues } from "@/lib/api/venue-access"
import { NavbarClient } from "./navbar-client"

export async function Navbar() {
  const session = await getServerSession(authOptions)

  let venues: Array<{ id: string; name: string; slug: string; role: string }> = []
  if (session?.user?.id) {
    const mine = await myVenues(session.user.id).catch(() => [])
    venues = mine.map(({ id, name, slug, role }) => ({ id, name, slug, role }))
  }

  return <NavbarClient session={session} venues={venues} />
}
