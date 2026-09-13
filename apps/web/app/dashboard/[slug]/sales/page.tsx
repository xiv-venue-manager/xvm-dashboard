"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { BarChart3, Zap, TrendingUp, Hash } from "lucide-react"
import { StatReadout } from "@/components/ui/stat-readout"
import { VenueLayoutClient } from "@/components/venue-layout-client"
import { VenueEyebrow } from "@/components/venue-eyebrow"
import { SalesLogDialog } from "@/components/sales-log-dialog"
import { TransactionsList, type Transaction } from "@/components/transactions-list"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { PageLoading } from "@/components/ui/loading-spinner"
import { minorUnitsToDollars } from "@/lib/api/position-convert"

interface FinanceTransactionRow {
  id: number
  amount: number
  service_id: number | null
  service_name: string | null
  recorded_by_person_id: number | null
  customer_name: string | null
  notes: string | null
  created_at: string
}

interface Service {
  id: number
  name: string
  price: number
}

interface StaffMember {
  user: { id: number; name: string | null }
}

// Default lookback window for the transactions list. xvm-api's finance list
// endpoint takes a from/to window instead of the old cursor - there's no
// "load more" left to build against, so this just shows everything recorded
// in the last 30 days rather than reintroducing pagination.
const LOOKBACK_DAYS = 30

function toUiTransaction(row: FinanceTransactionRow): Transaction {
  return {
    id: row.id,
    amount: minorUnitsToDollars(row.amount) ?? 0,
    serviceId: row.service_id,
    serviceName: row.service_name,
    recordedByPersonId: row.recorded_by_person_id,
    customerName: row.customer_name,
    notes: row.notes,
    createdAt: row.created_at,
  }
}

export default function SalesPage({ params }: { params: Promise<{ slug: string }> }) {
  const [slug, setSlug] = useState("")
  const [venueId, setVenueId] = useState("")
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [staffNamesByPersonId, setStaffNamesByPersonId] = useState<Map<number, string>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    params.then((p) => setSlug(p.slug))
  }, [params])

  useEffect(() => {
    if (!slug) return

    const fetchData = async () => {
      try {
        setIsLoading(true)
        setError("")

        const venueResponse = await fetch(`/api/venues`)
        if (!venueResponse.ok) throw new Error("Failed to fetch venue")
        const venues = await venueResponse.json()
        const venue = venues.find((v: { slug: string; id: string }) => v.slug === slug)
        if (!venue) throw new Error("Venue not found")
        setVenueId(venue.id)

        const to = new Date()
        const from = new Date(to.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)

        const [transactionsResponse, servicesResponse, staffResponse] = await Promise.all([
          fetch(
            `/api/venues/${venue.id}/transactions?startDate=${from.toISOString()}&endDate=${to.toISOString()}`
          ),
          fetch(`/api/venues/${venue.id}/services`),
          fetch(`/api/venues/${venue.id}/staff`),
        ])

        if (!transactionsResponse.ok) {
          const data = await transactionsResponse.json()
          throw new Error(data.message || data.error || "Failed to fetch transactions")
        }
        if (!servicesResponse.ok) throw new Error("Failed to fetch services")

        const transactionsData: { transactions: FinanceTransactionRow[] } = await transactionsResponse.json()
        const servicesData: Array<{ id: number; name: string; price_minor: number | null; is_active: boolean }> =
          await servicesResponse.json()

        setTransactions(transactionsData.transactions.map(toUiTransaction))
        setServices(
          servicesData
            .filter((s) => s.is_active)
            .map((s) => ({ id: s.id, name: s.name, price: minorUnitsToDollars(s.price_minor) ?? 0 }))
        )

        // Top-earners resolution: staff route already exposes person id +
        // display name per membership (same lookup services page uses for
        // position names) - reuse it here instead of a separate id-only endpoint.
        if (staffResponse.ok) {
          const staffData: StaffMember[] = await staffResponse.json()
          setStaffNamesByPersonId(new Map(staffData.map((s) => [s.user.id, s.user.name ?? "Unknown"])))
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load sales")
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [slug])

  if (!slug) {
    return (
      <div className="page-inner">
        <PageLoading />
      </div>
    )
  }

  const totalRevenue = transactions.reduce((sum, t) => sum + t.amount, 0)
  const todayTransactions = transactions.filter(
    (t) => new Date(t.createdAt).toDateString() === new Date().toDateString()
  )
  const todayRevenue = todayTransactions.reduce((sum, t) => sum + t.amount, 0)

  // Top services by revenue — service_name comes straight off the
  // transaction row, no separate service lookup needed.
  const serviceMap = new Map<number, { name: string; total: number }>()
  for (const t of transactions) {
    if (t.serviceId != null) {
      if (!serviceMap.has(t.serviceId)) serviceMap.set(t.serviceId, { name: t.serviceName ?? "Service", total: 0 })
      serviceMap.get(t.serviceId)!.total += t.amount
    }
  }
  const topServices = [...serviceMap.values()].sort((a, b) => b.total - a.total).slice(0, 5)
  const maxServiceTotal = topServices[0]?.total || 1

  // Top earners by revenue — grouped by recorded_by_person_id, resolved to a
  // display name via the staff roster fetched above.
  const earnerMap = new Map<number, { name: string; total: number }>()
  for (const t of transactions) {
    if (t.recordedByPersonId != null) {
      if (!earnerMap.has(t.recordedByPersonId)) {
        earnerMap.set(t.recordedByPersonId, {
          name: staffNamesByPersonId.get(t.recordedByPersonId) ?? "Unknown",
          total: 0,
        })
      }
      earnerMap.get(t.recordedByPersonId)!.total += t.amount
    }
  }
  const topEarners = [...earnerMap.values()].sort((a, b) => b.total - a.total).slice(0, 5)

  return (
    <VenueLayoutClient slug={slug}>
      <div className="page-inner">
        {/* Header */}
        <div className="head-row">
          <div>
            <VenueEyebrow slug={slug} />
            <h1 className="page-h1">Sales</h1>
          </div>
          {venueId && (
            <SalesLogDialog
              venueId={venueId}
              services={services}
              onLogged={(t) => setTransactions((prev) => [t, ...prev])}
            />
          )}
        </div>

        {error && (
          <Alert className="mb-6 bg-destructive/10 border-destructive/20">
            <AlertDescription className="text-destructive">{error}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <PageLoading text="Loading sales..." />
        ) : (
          <>
            {/* KPIs — 4 stats matching prototype */}
            <div className="kpis mb-6">
              <Card className="px-[18px] py-4">
                <StatReadout
                  label="Sales today"
                  value={`${todayRevenue.toLocaleString()}`}
                  subtext="gil"
                  icon={<Zap />}
                  iconVariant="success"
                  deltaDirection={todayRevenue > 0 ? "up" : undefined}
                />
              </Card>
              <Card className="px-[18px] py-4">
                <StatReadout
                  label={`Last ${LOOKBACK_DAYS} days`}
                  value={`${totalRevenue.toLocaleString()}`}
                  subtext="gil"
                  icon={<BarChart3 />}
                  iconVariant="blue"
                />
              </Card>
              <Card className="px-[18px] py-4">
                <StatReadout
                  label="Avg sale"
                  value={`${transactions.length > 0 ? Math.round(totalRevenue / transactions.length).toLocaleString() : 0}`}
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
                      <p className="text-muted-foreground">No sales recorded yet.</p>
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
                      <span className="ml-auto text-xs text-[var(--fg-faint)] font-normal">
                        Last {LOOKBACK_DAYS} days
                      </span>
                    </div>
                    <div className="p-5">
                      <TransactionsList
                        transactions={transactions}
                        venueId={venueId}
                        onTransactionsChange={setTransactions}
                      />
                    </div>
                  </Card>
                )}
              </div>

              {/* Right — top services */}
              <div className="space-y-4">
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
                              {s.total.toLocaleString()} gil
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
                            {e.total.toLocaleString()} gil
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </VenueLayoutClient>
  )
}
