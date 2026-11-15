import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { myVenues } from "@/lib/api/venue-access"
import { isPlatformAdmin } from "@/lib/admin-access"
import { NavbarClient } from "./navbar-client"

export async function Navbar() {
  const session = await getServerSession(authOptions)

  let venues: Array<{ id: string; name: string; slug: string; role: string }> = []
  let isAdmin = false
  if (session?.user?.id) {
    const [mine, admin] = await Promise.all([
      myVenues(session.user.id).catch(() => []),
      isPlatformAdmin(session.user.id),
    ])
    venues = mine.map(({ id, name, slug, role }) => ({ id, name, slug, role }))
    isAdmin = admin
  }

  return <NavbarClient session={session} venues={venues} isPlatformAdmin={isAdmin} />
}
