import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { VenueLayout } from "@/components/venue-layout"
import { PatronLogsManager } from "@/components/patron-logs-manager"
import { PatronProfilesTable, type PatronProfile } from "@/components/patron-profiles-table"
import { xvmPageReader } from "@/lib/api/xvm-page-read"
import {
  listMemberships,
  listPatronLogs,
  listPatrons,
  type MembershipRow,
  type PatronLogRow,
  type PatronSummary,
} from "@/lib/api/xvm-api"
import { listEventsInRange, type PageEvent } from "@/lib/api/event-window"
import { resolveDisplayName } from "@/lib/display-name"

const PAGE_LIMIT = 200
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_WINDOW_MS = 59 * DAY_MS

type SearchParams = {
  tab?: string
  eventId?: string
  from?: string
  to?: string
  character?: string
  classification?: "all" | "patron" | "staff"
}

export default async function PatronLogsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<SearchParams>
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { slug } = await params
  const sp = await searchParams

  const venue = await prisma.venue.findUnique({
    where: { slug },
    include: {
      memberships: { where: { userId: session.user.id } },
    },
  })

  if (!venue || venue.memberships.length === 0) notFound()

  const userRole = venue.memberships[0].role
  if (!["OWNER", "MANAGER"].includes(userRole)) notFound()

  const activeTab = sp.tab === "log" ? "log" : "profiles"
  const readXvm = await xvmPageReader(session.user.id, venue.xvmApiVenueId)

  const patrons = await readXvm("patron logs patrons", [] as PatronSummary[], (t, v) => listPatrons(t, v))

  let patronProfiles: PatronProfile[] = []
  if (activeTab === "profiles") {
    patronProfiles = patrons
      .filter((p) => p.visits > 0)
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 500)
      .map((p) => ({
        id: String(p.id),
        characterName: p.character_name,
        world: p.world,
        visits: p.visits,
        lastSeen: p.last_seen ?? p.created_at,
      }))
  }

  const now = new Date()
  const requestedFrom = sp.from ? new Date(sp.from) : new Date(now.getTime() - 7 * DAY_MS)
  const to = sp.to ? new Date(sp.to) : now
  const earliest = new Date(to.getTime() - MAX_WINDOW_MS)
  const windowClamped = requestedFrom < earliest
  const from = windowClamped ? earliest : requestedFrom
  const eventFilter = sp.eventId && /^\d+$/.test(sp.eventId) ? Number(sp.eventId) : undefined

  let logs: PatronLogRow[] = []
  let events: PageEvent[] = []
  let roster: MembershipRow[] = []
  if (activeTab === "log") {
    ;[logs, events, roster] = await Promise.all([
      readXvm("patron logs rows", [] as PatronLogRow[], (t, v) =>
        listPatronLogs(t, v, {
          ...(eventFilter === undefined ? { from: from.toISOString(), to: to.toISOString() } : { eventId: eventFilter }),
          character: sp.character || undefined,
          classification: sp.classification === "staff" || sp.classification === "patron" ? sp.classification : undefined,
          limit: PAGE_LIMIT,
        })
      ),
      readXvm("patron logs events", [] as PageEvent[], (t, v) =>
        listEventsInRange(t, v, new Date(now.getTime() - 90 * DAY_MS), now, { now })
      ),
      readXvm("patron logs roster", [] as MembershipRow[], (t, v) => listMemberships(t, v)),
    ])
  }

  const nameByPersonId = new Map(
    roster.map((m) => [
      m.person.id,
      resolveDisplayName({ nickname: m.nickname, displayName: m.person.display_name }),
    ])
  )
  const realEvents = events.filter((e) => e.id !== null).reverse()
  const eventTitleById = new Map(realEvents.map((e) => [e.id as string, e.title]))
  const personRef = (id: number | null) =>
    id === null ? null : { id: String(id), name: nameByPersonId.get(id) ?? "Unknown" }

  return (
    <VenueLayout venueSlug={venue.slug} venueName={venue.name} userRole={userRole}>
      <div className="page-inner">
        <div className="mb-6 md:mb-8">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)] flex-shrink-0" />
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">
              {venue.name} &middot; {venue.dataCenter} &middot; {venue.world}
            </span>
          </div>
          <h1 className="page-h1">Patron Logs</h1>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-[var(--card)] border border-[var(--blue-015)] rounded-full p-1 w-fit mb-6">
          <Link
            href={`/dashboard/${slug}/patron-logs`}
            className={`text-sm font-semibold px-5 py-1.5 rounded-full transition-colors ${
              activeTab === "profiles"
                ? "bg-[var(--xiv-blue)] text-[var(--xiv-navy)]"
                : "text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)]"
            }`}
          >
            Patron Profiles
          </Link>
          <Link
            href={`/dashboard/${slug}/patron-logs?tab=log`}
            className={`text-sm font-semibold px-5 py-1.5 rounded-full transition-colors ${
              activeTab === "log"
                ? "bg-[var(--xiv-blue)] text-[var(--xiv-navy)]"
                : "text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)]"
            }`}
          >
            Log &amp; Reclassify
          </Link>
        </div>

        {activeTab === "profiles" ? (
          <PatronProfilesTable
            profiles={patronProfiles}
            venueSlug={venue.slug}
            canModerate={["OWNER", "MANAGER"].includes(userRole)}
          />
        ) : (
          <>
            {windowClamped && (
              <p className="text-sm text-muted-foreground mb-4">
                Showing the 59 days before {to.toISOString().slice(0, 10)}. The log reads at most 59 days at a time.
              </p>
            )}
            <PatronLogsManager
              venueId={venue.id}
              logs={logs.map((l) => ({
                id: String(l.id),
                timestamp: l.ts,
                characterName: l.character_name,
                world: l.world,
                action: l.action.toUpperCase(),
                wasWorking: l.was_working,
                workingUser: personRef(l.working_person_id),
                event:
                  l.event_id === null
                    ? null
                    : { id: String(l.event_id), title: eventTitleById.get(String(l.event_id)) ?? "Event" },
                reclassifiedAt: l.reclassified_at,
                reclassifiedBy: personRef(l.reclassified_by_person_id),
                reclassifyReason: l.reclassify_reason,
              }))}
              events={realEvents.map((e) => ({
                id: e.id as string,
                title: e.title,
                startTime: e.startTime.toISOString(),
                endTime: e.endTime.toISOString(),
              }))}
              staff={roster.map((m) => ({
                id: String(m.person.id),
                name: resolveDisplayName({ nickname: m.nickname, displayName: m.person.display_name }),
              }))}
              characters={patrons.slice(0, 500).map((p) => ({ name: p.character_name, world: p.world }))}
              characterUserMap={[]}
              initialFilters={{
                eventId: sp.eventId ?? "",
                from: from.toISOString().slice(0, 10),
                to: to.toISOString().slice(0, 10),
                character: sp.character ?? "",
                classification: sp.classification ?? "all",
              }}
              limitHit={logs.length === PAGE_LIMIT}
            />
          </>
        )}
      </div>
    </VenueLayout>
  )
}
