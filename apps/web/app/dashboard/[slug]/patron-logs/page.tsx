import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { VenueLayout } from "@/components/venue-layout"
import { PatronLogsManager } from "@/components/patron-logs-manager"
import { PatronProfilesTable, type PatronProfile } from "@/components/patron-profiles-table"

const PAGE_LIMIT = 200

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

  // ── Profiles tab: aggregate patron visits ────────────────────────────
  let patronProfiles: PatronProfile[] = []

  if (activeTab === "profiles") {
    const grouped = await prisma.patronLog.groupBy({
      by: ["characterName", "world"],
      where: {
        venueId: venue.id,
        characterName: { not: null },
        wasWorking: false,
        action: "ENTER",
      },
      _count: { _all: true },
      _max: { timestamp: true },
      orderBy: { characterName: "asc" },
      take: 500,
    })
    // Ensure a canonical Patron row exists for every distinct character
    // seen in this venue's logs, then pull id/ban status for the profile list.
    const distinctPairs = grouped
      .filter((r) => r.characterName)
      .map((r) => ({ characterName: r.characterName!, world: r.world ?? "" }))

    if (distinctPairs.length > 0) {
      await prisma.patron.createMany({
        data: distinctPairs.map((p) => ({
          venueId: venue.id,
          characterName: p.characterName,
          world: p.world,
        })),
        skipDuplicates: true,
      })
    }

    const patronRecords = await prisma.patron.findMany({
      where: { venueId: venue.id },
      select: { id: true, characterName: true, world: true },
    })
    const patronMap = new Map(patronRecords.map((p) => [`${p.characterName}|${p.world}`, p]))

    // Total spent: match transaction.customerName to characterName (fuzzy)
    const spendGroups = await prisma.transaction.groupBy({
      by: ["customerName"],
      where: { venueId: venue.id, customerName: { not: null } },
      _sum: { amount: true },
      orderBy: { customerName: "asc" },
      take: 2000,
    })
    const spendMap = new Map(spendGroups.map((s) => [s.customerName!.toLowerCase().trim(), Number(s._sum.amount ?? 0)]))

    patronProfiles = grouped
      .filter((r) => r.characterName)
      .sort((a, b) => b._count._all - a._count._all)
      .map((r) => {
        const key = `${r.characterName}|${r.world ?? ""}`
        const patron = patronMap.get(key)
        return {
          id: patron?.id ?? "",
          characterName: r.characterName!,
          world: r.world ?? "",
          visits: r._count._all,
          lastSeen: (r._max.timestamp ?? new Date()).toISOString(),
          totalSpent: spendMap.get(r.characterName!.toLowerCase().trim()) ?? 0,
        }
      })
  }

  // ── Log tab: existing filtered query ─────────────────────────────────
  const now = new Date()
  const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const from = sp.from ? new Date(sp.from) : defaultFrom
  const to = sp.to ? new Date(sp.to) : now

  const where: {
    venueId: string
    eventId?: string
    timestamp?: { gte?: Date; lte?: Date }
    characterName?: string
    wasWorking?: boolean
  } = { venueId: venue.id }

  if (sp.eventId) where.eventId = sp.eventId
  if (sp.character) where.characterName = sp.character
  if (sp.classification === "staff") where.wasWorking = true
  if (sp.classification === "patron") where.wasWorking = false
  if (!sp.eventId) where.timestamp = { gte: from, lte: to }

  const [logs, events, staff, distinctCharacters] = await Promise.all([
    prisma.patronLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: PAGE_LIMIT,
      include: {
        workingUser: { select: { id: true, name: true } },
        reclassifiedBy: { select: { id: true, name: true } },
        event: { select: { id: true, title: true } },
      },
    }),
    prisma.event.findMany({
      where: {
        venueId: venue.id,
        startTime: { gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { startTime: "desc" },
      select: { id: true, title: true, startTime: true, endTime: true },
      take: 100,
    }),
    prisma.membership.findMany({
      where: { venueId: venue.id, status: "active" },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.patronLog.findMany({
      where: { venueId: venue.id, characterName: { not: null } },
      distinct: ["characterName"],
      select: { characterName: true, world: true },
      orderBy: { characterName: "asc" },
      take: 500,
    }),
  ])

  const characterUserMap = await prisma.userCharacter.findMany({
    where: {
      OR: logs
        .filter((l) => l.characterName && l.world)
        .map((l) => ({ characterName: l.characterName!, world: l.world! })),
    },
    select: {
      characterName: true,
      world: true,
      userId: true,
      user: { select: { name: true } },
    },
  })

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
          <PatronLogsManager
            venueId={venue.id}
            logs={logs.map((l) => ({
              id: l.id,
              timestamp: l.timestamp.toISOString(),
              characterName: l.characterName,
              world: l.world,
              action: l.action,
              wasWorking: l.wasWorking,
              workingUser: l.workingUser,
              event: l.event,
              reclassifiedAt: l.reclassifiedAt?.toISOString() ?? null,
              reclassifiedBy: l.reclassifiedBy,
              reclassifyReason: l.reclassifyReason,
            }))}
            events={events.map((e) => ({
              id: e.id,
              title: e.title,
              startTime: e.startTime.toISOString(),
              endTime: e.endTime?.toISOString() ?? null,
            }))}
            staff={staff.filter((m) => m.user).map((m) => ({ id: m.user!.id, name: m.user!.name ?? "(no name)" }))}
            characters={distinctCharacters
              .filter((c) => c.characterName)
              .map((c) => ({ name: c.characterName!, world: c.world ?? "" }))}
            characterUserMap={characterUserMap.map((c) => ({
              characterName: c.characterName,
              world: c.world,
              userId: c.userId,
              userName: c.user?.name ?? "(no name)",
            }))}
            initialFilters={{
              eventId: sp.eventId ?? "",
              from: from.toISOString().slice(0, 10),
              to: to.toISOString().slice(0, 10),
              character: sp.character ?? "",
              classification: sp.classification ?? "all",
            }}
            limitHit={logs.length === PAGE_LIMIT}
          />
        )}
      </div>
    </VenueLayout>
  )
}
