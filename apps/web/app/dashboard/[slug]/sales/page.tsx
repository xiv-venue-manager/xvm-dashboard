import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart3, Zap, TrendingUp, Hash } from "lucide-react"
import { StatReadout } from "@/components/ui/stat-readout"
import { VenueLayoutClient } from "@/components/venue-layout-client"
import { VenueEyebrow } from "@/components/venue-eyebrow"
import { SalesLogDialog } from "@/components/sales-log-dialog"
import { TransactionsList } from "@/components/transactions-list"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { resolveDisplayName } from "@/lib/display-name"

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function SalesPage({ params }: PageProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect("/api/auth/signin")
  }

  const { slug } = await params

  // Fetch venue
  const venue = await prisma.venue.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      settings: true,
    },
  })

  if (!venue) {
    return (
      <div className="page-inner">
        <Alert className="bg-destructive/10 border-destructive/20">
          <AlertDescription className="text-destructive">Venue not found</AlertDescription>
        </Alert>
      </div>
    )
  }

  // Check if user has access to this venue
  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.user.id,
      venueId: venue.id,
    },
  })

  if (!membership) {
    return (
      <div className="page-inner">
        <Alert className="bg-destructive/10 border-destructive/20">
          <AlertDescription className="text-destructive">You don't have access to this venue</AlertDescription>
        </Alert>
      </div>
    )
  }

  const venueSettings = venue.settings as any

  // Check sales visibility for STAFF members
  if (membership.role === "STAFF" && venueSettings?.salesVisibility) {
    const salesVisibility = venueSettings.salesVisibility

    if (salesVisibility === "none") {
      return (
        <VenueLayoutClient slug={slug}>
          <div className="page-inner">
            <Alert className="bg-destructive/10 border-destructive/20">
              <AlertDescription className="text-destructive">
                You don't have permission to view sales data
              </AlertDescription>
            </Alert>
          </div>
        </VenueLayoutClient>
      )
    }
  }

  // Build where clause for transactions
  const where: any = { venueId: venue.id }

  // Apply sales visibility settings for STAFF members
  if (membership.role === "STAFF" && venueSettings?.salesVisibility === "own") {
    where.staffId = session.user.id
  }

  // Fetch data in parallel
  const [transactionsData, services, activeEvents] = await Promise.all([
    // Get first 50 transactions
    prisma.transaction.findMany({
      where,
      include: {
        service: {
          select: {
            id: true,
            name: true,
            price: true,
          },
        },
        event: {
          select: {
            id: true,
            title: true,
          },
        },
        staff: {
          select: {
            id: true,
            name: true,
            displayName: true,
            characters: {
              orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
              take: 1,
              select: { characterName: true },
            },
            memberships: {
              where: { venueId: venue.id },
              select: {
                role: true,
                nickname: true,
                customRole: {
                  select: {
                    name: true,
                    color: true,
                  },
                },
              },
              take: 1,
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 51, // Fetch one extra to check if there are more
    }),
    // Get active services
    prisma.service.findMany({
      where: {
        venueId: venue.id,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        price: true,
        category: true,
        isActive: true,
      },
    }),
    // Get active/published events
    prisma.event.findMany({
      where: {
        venueId: venue.id,
        status: {
          in: ["PUBLISHED", "ACTIVE"],
        },
      },
      select: {
        id: true,
        title: true,
        startTime: true,
        status: true,
      },
      orderBy: {
        startTime: "desc",
      },
      take: 10,
    }),
  ])

  const hasMore = transactionsData.length > 50
  const transactions = (hasMore ? transactionsData.slice(0, 50) : transactionsData).map((t) => {
    if (!t.staff) return t
    const resolvedName = resolveDisplayName({
      characterName: t.staff.characters[0]?.characterName,
      nickname: t.staff.memberships[0]?.nickname,
      displayName: t.staff.displayName,
      discordName: t.staff.name,
    })
    return { ...t, staff: { ...t.staff, name: resolvedName } }
  })
  const nextCursor = hasMore ? transactions[transactions.length - 1]?.id : null

  // Convert Prisma Decimal to number for services
  const servicesWithNumberPrices = services.map((service) => ({
    ...service,
    price: Number(service.price),
  }))

  // Calculate totals
  const totalRevenue = transactions.reduce((sum, t) => sum + Number(t.amount), 0)
  const todayTransactions = transactions.filter(
    (t) => new Date(t.createdAt).toDateString() === new Date().toDateString()
  )
  const todayRevenue = todayTransactions.reduce((sum, t) => sum + Number(t.amount), 0)

  // Top services by revenue
  const serviceMap = new Map<string, { name: string; total: number; count: number }>()
  for (const t of transactions) {
    if (t.service) {
      if (!serviceMap.has(t.service.id)) serviceMap.set(t.service.id, { name: t.service.name, total: 0, count: 0 })
      const s = serviceMap.get(t.service.id)!
      s.total += Number(t.amount)
      s.count++
    }
  }
  const topServices = [...serviceMap.values()].sort((a, b) => b.total - a.total).slice(0, 5)
  const maxServiceTotal = topServices[0]?.total || 1

  // Top earners by revenue
  const earnerMap = new Map<string, { name: string; total: number; count: number }>()
  for (const t of transactions) {
    if (t.staff) {
      if (!earnerMap.has(t.staff.id)) earnerMap.set(t.staff.id, { name: t.staff.name || "Unknown", total: 0, count: 0 })
      const e = earnerMap.get(t.staff.id)!
      e.total += Number(t.amount)
      e.count++
    }
  }
  const topEarners = [...earnerMap.values()].sort((a, b) => b.total - a.total).slice(0, 5)

  // Convert Prisma Decimal fields to number before crossing the Server ->
  // Client Component boundary - RSC serialization rejects Decimal objects.
  const serializedTransactions = transactions.map((t) => ({
    ...t,
    amount: Number(t.amount),
    createdAt: t.createdAt.toISOString(),
    service: t.service ? { ...t.service, price: Number(t.service.price) } : null,
  }))

  return (
    <VenueLayoutClient slug={slug}>
      <div className="page-inner">
        {/* Header */}
        <div className="head-row">
          <div>
            <VenueEyebrow slug={slug} />
            <h1 className="page-h1">Sales</h1>
          </div>
          <SalesLogDialog venueId={venue.id} services={servicesWithNumberPrices} events={activeEvents} />
        </div>

        {/* KPIs — 4 stats matching prototype */}
        <div className="kpis mb-6">
          <Card className="px-[18px] py-4">
            <StatReadout
              label="Sales tonight"
              value={`${todayRevenue.toLocaleString("en-US")}`}
              subtext="gil"
              icon={<Zap />}
              iconVariant="success"
              deltaDirection={todayRevenue > 0 ? "up" : undefined}
            />
          </Card>
          <Card className="px-[18px] py-4">
            <StatReadout
              label="This week"
              value={`${totalRevenue.toLocaleString("en-US")}`}
              subtext="gil"
              icon={<BarChart3 />}
              iconVariant="blue"
            />
          </Card>
          <Card className="px-[18px] py-4">
            <StatReadout
              label="Avg sale"
              value={`${transactions.length > 0 ? Math.round(totalRevenue / transactions.length).toLocaleString("en-US") : 0}`}
              subtext="gil"
              icon={<TrendingUp />}
              iconVariant="blue"
            />
          </Card>
          <Card className="px-[18px] py-4">
            <StatReadout
              label="Transactions"
              value={transactions.length}
              subtext="total"
              icon={<Hash />}
              iconVariant="blue"
            />
          </Card>
        </div>

        {/* 2-col body — matches prototype .cols-2 */}
        <div className="cols-2 items-start">
          {/* Left — transactions */}
          <div>
            {transactions.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent>
                  <p className="text-muted-foreground mb-4">No sales recorded yet.</p>
                  <SalesLogDialog venueId={venue.id} services={servicesWithNumberPrices} events={activeEvents} />
                </CardContent>
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <div className="flex items-center gap-2 px-[22px] py-[13px] border-b border-[var(--blue-008)] font-semibold text-sm">
                  <svg
                    className="w-4 h-4 text-[var(--xiv-blue)]"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  Transaction history
                  <span className="ml-auto text-xs text-[var(--fg-faint)] font-normal">All sales</span>
                </div>
                <div className="p-5">
                  <TransactionsList
                    initialTransactions={serializedTransactions}
                    initialNextCursor={nextCursor}
                    initialHasMore={hasMore}
                    venueId={venue.id}
                  />
                </div>
              </Card>
            )}
          </div>

          {/* Right — top services + top earners */}
          <div className="space-y-4">
            {/* Top services */}
            {topServices.length > 0 && (
              <div className="rounded-xl border border-[var(--blue-018)] bg-[var(--card)] overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--blue-008)] font-semibold text-sm">
                  <svg
                    className="w-4 h-4 text-[var(--xiv-blue)]"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                  </svg>
                  Top services
                </div>
                <div className="px-4 py-3 space-y-3">
                  {topServices.map((s) => (
                    <div key={s.name}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium truncate mr-2">{s.name}</span>
                        <span className="text-[var(--xiv-blue)] font-semibold shrink-0">
                          {s.total.toLocaleString("en-US")} gil
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[var(--blue-008)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--xiv-blue)] transition-all"
                          style={{ width: `${Math.round((s.total / maxServiceTotal) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top earners */}
            {topEarners.length > 0 && (
              <div className="rounded-xl border border-[var(--blue-018)] bg-[var(--card)] overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--blue-008)] font-semibold text-sm">
                  <svg
                    className="w-4 h-4 text-[var(--xiv-blue)]"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  Top earners
                </div>
                <div className="divide-y divide-[var(--blue-008)]">
                  {topEarners.map((e) => (
                    <div key={e.name} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--xiv-blue)] to-blue-700 flex items-center justify-center text-[0.62rem] font-bold text-white flex-shrink-0">
                        {e.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="flex-1 text-sm font-medium truncate">{e.name}</span>
                      <span className="text-xs text-[var(--xiv-blue)] font-semibold shrink-0">
                        {e.total.toLocaleString("en-US")} gil
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </VenueLayoutClient>
  )
}
