import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { prisma } from "@/lib/prisma"
import { Building2, Users, ChevronRight, Plus } from "lucide-react"
import { AnnouncementBanner } from "@/components/announcement-banner"
import { xvmPersonReader } from "@/lib/api/xvm-page-read"
import { listMyAnnouncements, type AnnouncementRow } from "@/lib/api/xvm-api"
import { toAnnouncementShape } from "@/lib/api/announcement-shape"
import { CharacterLinkNudge } from "@/components/character-link-nudge"

const roleColors: Record<string, string> = {
  OWNER: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  MANAGER: "bg-[rgba(0,180,255,0.15)] text-[var(--xiv-blue)] border-[rgba(0,180,255,0.35)]",
  STAFF: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    redirect("/auth/signin")
  }

  const readPerson = await xvmPersonReader(session.user.id)
  const announcements = (await readPerson("dashboard announcements", [] as AnnouncementRow[], (t) => listMyAnnouncements(t))).map(
    toAnnouncementShape
  )

  const hasLinkedCharacter =
    (await prisma.userCharacter.count({
      where: { userId: session.user.id },
    })) > 0

  const venues = await prisma.venue.findMany({
    where: {
      memberships: {
        some: { userId: session.user.id },
      },
    },
    include: {
      memberships: {
        where: { userId: session.user.id },
      },
      _count: {
        select: { events: true, memberships: true },
      },
    },
    orderBy: { name: "asc" },
  })

  return (
    <div className="page-inner">
      <AnnouncementBanner announcements={announcements} />
      {!hasLinkedCharacter && <CharacterLinkNudge />}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-8">
        <div>
          <h1 className="page-h1">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Welcome back, {session.user.name || "User"}!</p>
        </div>
        <Button asChild className="xiv-cta">
          <Link href="/venues/new">
            <Plus className="h-4 w-4 mr-1.5" />
            New Venue
          </Link>
        </Button>
      </div>

      {venues.length === 0 ? (
        <div className="xiv-card rounded-2xl p-12 text-center space-y-4">
          <Building2 className="h-12 w-12 text-[var(--xiv-blue)] mx-auto opacity-60" />
          <div>
            <p className="font-cinzel text-lg font-semibold tracking-wide">No Venues Yet</p>
            <p className="text-muted-foreground text-sm mt-1">
              Create your first venue to start managing events, staff, and more.
            </p>
          </div>
          <Button asChild className="xiv-cta">
            <Link href="/venues/new">Create Your First Venue</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {venues.map((venue: (typeof venues)[number]) => {
              const role = venue.memberships[0].role
              const roleClass = roleColors[role] || roleColors.STAFF
              return (
                <Link key={venue.id} href={`/dashboard/${venue.slug}`} className="group block">
                  <div className="xiv-card rounded-xl p-5 h-full flex flex-col gap-4 cursor-pointer transition-all duration-200 group-hover:border-[rgba(0,180,255,0.4)] group-hover:shadow-[0_0_28px_rgba(0,180,255,0.1)]">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-cinzel font-semibold text-base tracking-wide truncate">{venue.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {venue.world} · {venue.dataCenter}
                        </p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border shrink-0 ${roleClass}`}>
                        {role}
                      </span>
                    </div>

                    {/* Description */}
                    {venue.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{venue.description}</p>
                    )}

                    {/* Stats */}
                    <div className="flex gap-4 mt-auto">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Building2 className="h-3.5 w-3.5 text-[var(--xiv-blue)] opacity-70" />
                        <span className="font-semibold">{venue._count.events}</span>
                        <span className="text-muted-foreground">Events</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Users className="h-3.5 w-3.5 text-[var(--xiv-blue)] opacity-70" />
                        <span className="font-semibold">{venue._count.memberships}</span>
                        <span className="text-muted-foreground">Staff</span>
                      </div>
                    </div>

                    {/* CTA */}
                    <div className="flex items-center justify-between pt-3 border-t border-[rgba(0,180,255,0.1)]">
                      <span className="text-sm text-[var(--xiv-blue)] font-medium">Manage Venue</span>
                      <ChevronRight className="h-4 w-4 text-[var(--xiv-blue)] transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>

          {/* Add venue nudge when user has few venues */}
          {venues.length < 3 && (
            <div className="mt-6 flex items-center justify-center">
              <Link
                href="/venues/new"
                className="group flex items-center gap-2 text-sm text-muted-foreground hover:text-[var(--xiv-blue)] transition-colors"
              >
                <Plus className="h-4 w-4 opacity-50 group-hover:opacity-100 transition-opacity" />
                Add another venue
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  )
}
