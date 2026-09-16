"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { VenueLayoutClient } from "@/components/venue-layout-client"
import { VenueEyebrow } from "@/components/venue-eyebrow"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { format } from "date-fns"
import { TrendingUp, DollarSign, Users, Calendar, Target, Download } from "lucide-react"
import { StatReadout } from "@/components/ui/stat-readout"
import { LocalTime } from "@/components/server-time"
import { PageLoading } from "@/components/ui/loading-spinner"
import { AttendanceOverview } from "@/components/analytics/attendance-overview"

interface AnalyticsData {
  venueId: string
  venueName: string
  summary: {
    totalRevenue: number
    avgRevenuePerEvent: number
    totalPatrons: number
    avgSpend: number
    repeatRate: number
    totalTransactions: number
    total: number
    upcoming: number
    completed: number
    recentCount: number
  }
  financial: {
    totalRevenue: number
    totalPayroll: number
    netProfit: number
    profitMargin: number
    payrollAsPercentOfRevenue: number
  }
  followers?: {
    total: number
    byMonth: Record<string, number>
  }
  revenueByEvent: Array<{
    eventId: string
    eventTitle: string
    startTime: string
    revenue: number
    payroll: number
    netProfit: number
  }>
  serviceRevenue: Array<{
    name: string
    revenue: number
  }>
  patronByEvent: Array<{
    eventId: string
    eventTitle: string
    startTime: string
    peakPatrons: number
  }>
  attendanceByHour: Array<{
    time: string
    avgCount: number
  }>
  patronMix?: {
    new: number
    regular: number
    vip: number
    total: number
    newPct: number
    regularPct: number
    vipPct: number
  }
  busiestNights?: Array<{ day: string; count: number; pct: number }>
}

export default function AnalyticsPage() {
  const params = useParams()
  const slug = params?.slug as string

  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<"30d" | "90d" | "all">("30d")

  useEffect(() => {
    if (slug) fetchAnalytics(period)
  }, [slug, period])

  const fetchAnalytics = async (p = period) => {
    try {
      setError(null)
      setIsLoading(true)
      const response = await fetch(`/api/venues/${slug}/analytics?period=${p}`)

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to fetch analytics")
      }

      const data: AnalyticsData = await response.json()
      setAnalyticsData(data)
    } catch (err) {
      console.error("Failed to fetch analytics:", err)
      setError(err instanceof Error ? err.message : "Failed to load analytics")
    } finally {
      setIsLoading(false)
    }
  }

  const exportToCSV = () => {
    if (!analyticsData) return

    // Prepare CSV data
    const csvHeaders = ["Event", "Date", "Revenue (gil)", "Payroll (gil)", "Net Profit/Loss (gil)", "Profit Margin (%)"]
    const csvRows = analyticsData.revenueByEvent.map((event) => {
      const profitMargin = event.revenue > 0 ? ((event.netProfit / event.revenue) * 100).toFixed(2) : "0.00"
      return [
        `"${event.eventTitle}"`,
        format(new Date(event.startTime), "MMM dd, yyyy"),
        event.revenue.toFixed(2),
        event.payroll.toFixed(2),
        event.netProfit.toFixed(2),
        profitMargin,
      ].join(",")
    })

    // Add summary row
    const totalRevenue = analyticsData.revenueByEvent.reduce((sum, e) => sum + e.revenue, 0)
    const totalPayroll = analyticsData.revenueByEvent.reduce((sum, e) => sum + e.payroll, 0)
    const totalProfit = totalRevenue - totalPayroll
    const overallMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : "0.00"

    csvRows.push("") // Empty row
    csvRows.push(
      [
        '"TOTAL (Last 10 Events)"',
        "",
        totalRevenue.toFixed(2),
        totalPayroll.toFixed(2),
        totalProfit.toFixed(2),
        overallMargin,
      ].join(",")
    )

    const csvContent = [csvHeaders.join(","), ...csvRows].join("\n")

    // Download CSV
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute("download", `${analyticsData.venueName}-financial-report-${format(new Date(), "yyyy-MM-dd")}.csv`)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Transform data for charts
  const todayStr = format(new Date(), "MMM dd")
  const financialData =
    analyticsData?.revenueByEvent.map((e) => ({
      date: format(new Date(e.startTime), "MMM dd"),
      fullDate: new Date(e.startTime),
      eventTitle: e.eventTitle,
      revenue: e.revenue,
      payroll: e.payroll,
      netProfit: e.netProfit,
      isToday: format(new Date(e.startTime), "MMM dd") === todayStr,
    })) || []

  const serviceRevenue =
    analyticsData?.serviceRevenue.map((s) => ({
      name: s.name,
      value: s.revenue,
    })) || []

  const patronData =
    analyticsData?.patronByEvent.map((e) => ({
      date: format(new Date(e.startTime), "MMM dd"),
      eventTitle: e.eventTitle,
      patrons: e.peakPatrons,
    })) || []

  const eventStats = analyticsData?.summary

  if (isLoading) {
    return (
      <VenueLayoutClient slug={slug}>
        <div className="page-inner">
          <PageLoading text="Loading analytics..." />
        </div>
      </VenueLayoutClient>
    )
  }

  if (error) {
    return (
      <VenueLayoutClient slug={slug}>
        <div className="page-inner">
          <div className="text-center text-red-500">
            <p>Error loading analytics: {error}</p>
            <button onClick={() => fetchAnalytics()} className="mt-4 px-4 py-2 rounded-md transition-colors xiv-cta">
              Retry
            </button>
          </div>
        </div>
      </VenueLayoutClient>
    )
  }

  // analyticsData must be non-null past this point
  if (!analyticsData) return null
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const data = analyticsData!

  // Use pre-calculated values from API
  const totalRevenue = eventStats?.totalRevenue || 0
  const avgDailyRevenue = eventStats?.avgRevenuePerEvent || 0
  const totalPatrons = eventStats?.totalPatrons || 0

  const COLORS = [
    "#00b4ff", // XIV blue
    "#10b981", // Emerald
    "#f59e0b", // Amber
    "#38bdf8", // Sky
    "#a78bfa", // Violet
  ]

  return (
    <VenueLayoutClient slug={slug}>
      <div className="page-inner">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 md:mb-8">
          <div>
            <VenueEyebrow slug={slug} />
            <h1 className="page-h1">Analytics</h1>
          </div>
          <div className="flex gap-1 bg-[var(--card)] border border-[var(--blue-015)] rounded-full p-1 self-start">
            {(["30d", "90d", "all"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                  period === p
                    ? "bg-[var(--xiv-blue)] text-[var(--xiv-navy)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)]"
                }`}
              >
                {p === "30d" ? "30 days" : p === "90d" ? "90 days" : "All time"}
              </button>
            ))}
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="kpis mb-6">
          <div className="stat">
            <div className="top">
              <span className="sb">
                <DollarSign size={16} />
              </span>
            </div>
            <div className="k">Revenue</div>
            <div className="v">
              {totalRevenue >= 1000000
                ? `${(totalRevenue / 1000000).toFixed(2)}m`
                : totalRevenue >= 1000
                  ? `${(totalRevenue / 1000).toFixed(1)}k`
                  : totalRevenue}{" "}
              <span className="unit">gil</span>
            </div>
            <div className="delta flat">{eventStats?.recentCount || 0} events tracked</div>
          </div>
          <div className="stat">
            <div className="top">
              <span className="sb">
                <Users size={16} />
              </span>
            </div>
            <div className="k">Patrons</div>
            <div className="v">{totalPatrons.toLocaleString("en-US")}</div>
            <div className="delta flat">unique visitors</div>
          </div>
          <div className="stat">
            <div className="top">
              <span className="sb em">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </span>
            </div>
            <div className="k">Avg spend</div>
            <div className="v">
              {eventStats?.avgSpend && eventStats.avgSpend > 0
                ? `${eventStats.avgSpend.toLocaleString("en-US")}`
                : avgDailyRevenue > 0
                  ? `${avgDailyRevenue.toLocaleString("en-US")}`
                  : "—"}{" "}
              <span className="unit">gil</span>
            </div>
            <div className="delta flat">per transaction</div>
          </div>
          <div className="stat">
            <div className="top">
              <span className="sb am">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
                  <path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </span>
            </div>
            <div className="k">Repeat rate</div>
            <div className="v">
              {eventStats?.repeatRate !== undefined
                ? `${eventStats.repeatRate}`
                : data.patronMix
                  ? `${Math.round(((data.patronMix.regular + data.patronMix.vip) / (data.patronMix.total || 1)) * 100)}`
                  : "—"}{" "}
              <span className="unit">%</span>
            </div>
            <div className="delta flat">3+ visits</div>
          </div>
        </div>

        {/* Charts */}
        <div className="space-y-6">
          {/* cols-2: revenue chart left, insights right */}
          <div className="cols-2">
            {/* Left: Revenue Chart */}
            {(() => {
              const maxRev = Math.max(...financialData.map((d) => d.revenue), 1)
              const totalRev = financialData.reduce((s, d) => s + d.revenue, 0)
              return (
                <Card className="overflow-hidden">
                  {/* chart-head: title | delta | spacer | total */}
                  <div className="flex items-baseline gap-3 px-5 py-4 border-b border-[var(--blue-008)]">
                    <span className="font-[var(--font-outfit)] font-semibold text-[0.95rem]">Revenue</span>
                    {financialData.length > 1 &&
                      (() => {
                        const last = financialData[financialData.length - 1]?.revenue ?? 0
                        const prev = financialData[financialData.length - 2]?.revenue ?? 0
                        const delta = prev > 0 ? Math.round(((last - prev) / prev) * 100) : null
                        return delta !== null ? (
                          <span
                            className={`text-xs font-semibold flex items-center gap-1 ${delta >= 0 ? "text-[var(--success-text)]" : "text-[var(--destructive)]"}`}
                          >
                            <svg
                              className="w-3 h-3"
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                            >
                              {delta >= 0 ? (
                                <polyline points="18 15 12 9 6 15" />
                              ) : (
                                <polyline points="6 9 12 15 18 9" />
                              )}
                            </svg>
                            {Math.abs(delta)}%
                          </span>
                        ) : null
                      })()}
                    <div className="flex-1" />
                    <span className="font-[var(--font-outfit)] font-bold text-[1.25rem]">
                      {totalRev >= 1000 ? `${(totalRev / 1000).toFixed(1)}k` : totalRev.toLocaleString("en-US")}
                      <span className="text-[0.82rem] font-medium text-muted-foreground ml-1">gil</span>
                    </span>
                    <button
                      onClick={exportToCSV}
                      className="ml-2 flex items-center gap-1 px-2.5 py-1 text-[0.72rem] rounded-lg xiv-btn-shimmer font-semibold xiv-cta"
                    >
                      <Download className="h-3 w-3" /> CSV
                    </button>
                  </div>
                  {/* CSS bar chart */}
                  <div className="flex items-end gap-[7px] h-[168px] px-5 pb-3.5 pt-5">
                    {financialData.map((d, i) => {
                      const pct = Math.max((d.revenue / maxRev) * 100, 2)
                      return (
                        <div
                          key={i}
                          className="flex-1 flex flex-col items-center gap-2 h-full justify-end group cursor-default"
                          title={`${d.eventTitle}: ${d.revenue.toLocaleString("en-US")} gil`}
                        >
                          <div
                            className="w-full max-w-[26px] rounded-t-[5px] rounded-b-[2px] transition-all group-hover:brightness-125"
                            style={{
                              height: `${pct}%`,
                              background: d.isToday
                                ? "linear-gradient(180deg,var(--xiv-blue),rgba(0,180,255,0.45))"
                                : "linear-gradient(180deg,var(--xiv-blue),rgba(0,180,255,0.25))",
                              boxShadow: d.isToday ? "0 0 16px rgba(0,180,255,0.4)" : undefined,
                            }}
                          />
                          <span className="text-[0.62rem] text-[var(--fg-faint)] tabular-nums">{d.date}</span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex justify-between px-5 py-3 text-[0.66rem] text-[var(--fg-faint)] border-t border-[var(--blue-008)]">
                    <span>Per event · last {financialData.length}</span>
                    {financialData.some((d) => d.isToday) && <span>Tonight</span>}
                  </div>
                </Card>
              )
            })()}

            {/* Right: Patron mix + Busiest nights + Top services + Discovery */}
            <div className="space-y-4">
              {/* Patron Visits — CSS bars (shown as right panel compact chart) */}
              {(() => {
                const maxPat = Math.max(...patronData.map((d) => d.patrons), 1)
                return (
                  <Card className="overflow-hidden">
                    <div className="flex items-baseline gap-3 px-5 py-4 border-b border-[var(--blue-008)]">
                      <span className="font-[var(--font-outfit)] font-semibold text-[0.95rem]">Patron Visits</span>
                      <div className="flex-1" />
                      <span className="text-[0.74rem] text-[var(--fg-faint)] font-normal">
                        Peak counts · last {patronData.length}
                      </span>
                    </div>
                    <div className="flex items-end gap-[7px] h-[168px] px-5 pb-3.5 pt-5">
                      {patronData.map((d, i) => {
                        const pct = Math.max((d.patrons / maxPat) * 100, 2)
                        return (
                          <div
                            key={i}
                            className="flex-1 flex flex-col items-center gap-2 h-full justify-end group cursor-default"
                            title={`${d.eventTitle}: ${d.patrons} patrons`}
                          >
                            <div
                              className="w-full max-w-[26px] rounded-t-[5px] rounded-b-[2px] transition-all group-hover:brightness-125"
                              style={{
                                height: `${pct}%`,
                                background: "linear-gradient(180deg,var(--xiv-blue),rgba(0,180,255,0.25))",
                              }}
                            />
                            <span className="text-[0.62rem] text-[var(--fg-faint)] tabular-nums">{d.date}</span>
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex justify-between px-5 py-3 text-[0.66rem] text-[var(--fg-faint)] border-t border-[var(--blue-008)]">
                      <span>Peak attendance per event</span>
                    </div>
                  </Card>
                )
              })()}

              {/* Right: Patron mix + Busiest nights + Top services */}
              <div className="space-y-4">
                {/* Patron mix */}
                {data.patronMix && data.patronMix.total > 1 && (
                  <div className="rounded-xl border border-[var(--blue-018)] bg-[var(--card)] overflow-hidden">
                    <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--blue-008)] font-semibold text-sm">
                      <svg
                        className="w-4 h-4 text-[var(--xiv-blue)]"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                        <path d="M22 12A10 10 0 0 0 12 2v10z" />
                      </svg>
                      Patron mix
                      <span className="ml-auto text-[0.68rem] text-[var(--fg-faint)] font-normal">30 days</span>
                    </div>
                    <div className="py-1">
                      {[
                        {
                          label: "New",
                          pct: data.patronMix.newPct,
                          count: data.patronMix.new,
                          color: "var(--xiv-blue)",
                        },
                        {
                          label: "Regular",
                          pct: data.patronMix.regularPct,
                          count: data.patronMix.regular,
                          color: "var(--success-text)",
                        },
                        {
                          label: "VIP",
                          pct: data.patronMix.vipPct,
                          count: data.patronMix.vip,
                          color: "var(--warning)",
                        },
                      ].map(({ label, pct, count, color }) => (
                        <div key={label} className="flex items-center gap-2 px-4 py-2">
                          <div className="flex items-center gap-1.5 w-20 flex-shrink-0">
                            <span className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ background: color }} />
                            <span className="text-xs">{label}</span>
                          </div>
                          <div className="flex-1 h-2 rounded-full bg-[var(--blue-010)] overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">{pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Busiest nights */}
                {data.busiestNights != null && (
                  <div className="rounded-xl border border-[var(--blue-018)] bg-[var(--card)] overflow-hidden">
                    <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--blue-008)] font-semibold text-sm">
                      <svg
                        className="w-4 h-4 text-[var(--xiv-blue)]"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <path d="M3 9h18M9 21V9" />
                      </svg>
                      Busiest nights
                      <span className="ml-auto text-[0.68rem] text-[var(--fg-faint)] font-normal">avg</span>
                    </div>
                    <div className="px-4 pt-3 pb-4">
                      <div className="flex items-end gap-1.5 h-[80px]">
                        {(data.busiestNights ?? []).map(({ day, pct, count }) => (
                          <div key={day} className="flex-1 flex flex-col items-center gap-1" title={`${day}: ${count}`}>
                            <div className="w-full flex flex-col justify-end" style={{ height: 64 }}>
                              <div
                                className="w-full rounded-t-sm"
                                style={{
                                  height: `${Math.max(pct, 4)}%`,
                                  background: pct > 70 ? "var(--xiv-blue)" : "rgba(0,180,255,0.3)",
                                }}
                              />
                            </div>
                            <span className="text-[0.6rem] text-muted-foreground">{day.charAt(0)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Top services */}
                <div className="rounded-xl border border-[var(--blue-018)] bg-[var(--card)] overflow-hidden">
                  <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--blue-008)] font-semibold text-sm">
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
                    <span className="ml-auto text-[0.68rem] text-[var(--fg-faint)] font-normal">by revenue</span>
                  </div>
                  {serviceRevenue.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-4 py-4">No service data yet.</p>
                  ) : (
                    <div className="px-4 py-3 space-y-2.5">
                      {serviceRevenue.slice(0, 5).map((s, i) => (
                        <div key={s.name}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-medium truncate mr-2">{s.name}</span>
                            <span className="text-[var(--xiv-blue)] font-semibold shrink-0 tabular-nums">
                              {s.value.toLocaleString("en-US")}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[var(--blue-008)] overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.round((s.value / (serviceRevenue[0]?.value || 1)) * 100)}%`,
                                background: COLORS[i % COLORS.length],
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          {/* end cols-2 */}

          {/* Average Traffic Flow */}
          <div>
            <AttendanceOverview data={analyticsData?.attendanceByHour || []} />
          </div>

          {/* Detailed Financial Table */}
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
              </svg>
              Detailed Financial Breakdown
              <span className="ml-auto text-xs text-[var(--fg-faint)] font-normal">
                Revenue · payroll · profit per event
              </span>
            </div>
            <div className="p-5">
              <div>
                <div className="rounded-xl border border-[rgba(0,180,255,0.15)] overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Event</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Payroll</TableHead>
                        <TableHead className="text-right">Net Profit/Loss</TableHead>
                        <TableHead className="text-right">Margin</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analyticsData?.revenueByEvent && data.revenueByEvent.length > 0 ? (
                        data.revenueByEvent.map((event) => {
                          const profitMargin =
                            event.revenue > 0 ? ((event.netProfit / event.revenue) * 100).toFixed(1) : "0.0"
                          return (
                            <TableRow key={event.eventId}>
                              <TableCell className="font-medium">{event.eventTitle}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {format(new Date(event.startTime), "MMM dd, yyyy")}
                              </TableCell>
                              <TableCell className="text-right font-medium text-[var(--xiv-blue)]">
                                {event.revenue.toLocaleString("en-US")} gil
                              </TableCell>
                              <TableCell className="text-right font-medium text-amber-400">
                                {event.payroll.toLocaleString("en-US")} gil
                              </TableCell>
                              <TableCell
                                className={`text-right font-semibold ${
                                  event.netProfit >= 0 ? "text-emerald-500" : "text-red-400"
                                }`}
                              >
                                {event.netProfit >= 0 ? "+" : ""}
                                {event.netProfit.toLocaleString("en-US")} gil
                              </TableCell>
                              <TableCell
                                className={`text-right font-medium ${
                                  parseFloat(profitMargin) >= 0 ? "text-emerald-500" : "text-red-400"
                                }`}
                              >
                                {profitMargin}%
                              </TableCell>
                            </TableRow>
                          )
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            No event data available
                          </TableCell>
                        </TableRow>
                      )}
                      {/* Total Row */}
                      {analyticsData?.revenueByEvent && data.revenueByEvent.length > 0 && (
                        <TableRow className="bg-[rgba(0,180,255,0.06)] font-semibold border-t border-[rgba(0,180,255,0.25)]">
                          <TableCell colSpan={2} className="text-[var(--xiv-blue)]">
                            TOTAL (Last 10 Events)
                          </TableCell>
                          <TableCell className="text-right text-[var(--xiv-blue)]">
                            {data.revenueByEvent.reduce((sum, e) => sum + e.revenue, 0).toLocaleString("en-US")} gil
                          </TableCell>
                          <TableCell className="text-right text-amber-400">
                            {data.revenueByEvent.reduce((sum, e) => sum + e.payroll, 0).toLocaleString("en-US")} gil
                          </TableCell>
                          <TableCell
                            className={`text-right ${
                              data.revenueByEvent.reduce((sum, e) => sum + e.netProfit, 0) >= 0
                                ? "text-emerald-500"
                                : "text-red-400"
                            }`}
                          >
                            {data.revenueByEvent.reduce((sum, e) => sum + e.netProfit, 0) >= 0 ? "+" : ""}
                            {data.revenueByEvent.reduce((sum, e) => sum + e.netProfit, 0).toLocaleString("en-US")} gil
                          </TableCell>
                          <TableCell
                            className={`text-right ${
                              data.financial.profitMargin >= 0 ? "text-emerald-500" : "text-red-400"
                            }`}
                          >
                            {data.financial.profitMargin.toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* (patron mix + busiest nights now in sidebar above) */}
        {false && (
          <div className="hidden">
            {/* Patron mix */}
            {(data.patronMix?.total ?? 0) > 1 && (
              <div className="rounded-xl border border-[var(--blue-018)] bg-[var(--card)] overflow-hidden">
                <div className="flex items-center gap-2 px-[22px] py-[13px] border-b border-[var(--blue-008)] font-semibold text-sm">
                  <svg
                    className="w-4 h-4 text-[var(--xiv-blue)]"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                    <path d="M22 12A10 10 0 0 0 12 2v10z" />
                  </svg>
                  Patron mix
                  <span className="ml-auto text-[0.68rem] text-[var(--fg-faint)] font-normal">30 days</span>
                </div>
                <div className="py-2">
                  {[
                    {
                      label: "New",
                      pct: data.patronMix?.newPct ?? 0,
                      count: data.patronMix?.new ?? 0,
                      color: "var(--xiv-blue)",
                    },
                    {
                      label: "Regular",
                      pct: data.patronMix?.regularPct ?? 0,
                      count: data.patronMix?.regular ?? 0,
                      color: "var(--success-text)",
                    },
                    {
                      label: "VIP",
                      pct: data.patronMix?.vipPct ?? 0,
                      count: data.patronMix?.vip ?? 0,
                      color: "var(--warning)",
                    },
                  ].map(({ label, pct, count, color }) => (
                    <div key={label} className="flex items-center gap-3 px-5 py-2.5">
                      <div className="flex items-center gap-2 w-24 flex-shrink-0">
                        <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: color }} />
                        <span className="text-sm">{label}</span>
                      </div>
                      <div className="flex-1 h-2.5 rounded-full bg-[var(--blue-010)] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: color }}
                        />
                      </div>
                      <div className="flex items-center gap-1.5 w-16 flex-shrink-0 justify-end">
                        <span className="text-sm text-muted-foreground tabular-nums">{pct}%</span>
                        <span className="text-[0.68rem] text-[var(--fg-faint)]">({count})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Busiest nights */}
            {data.busiestNights != null && (
              <div className="rounded-xl border border-[var(--blue-018)] bg-[var(--card)] overflow-hidden">
                <div className="flex items-center gap-2 px-[22px] py-[13px] border-b border-[var(--blue-008)] font-semibold text-sm">
                  <svg
                    className="w-4 h-4 text-[var(--xiv-blue)]"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18M9 21V9" />
                  </svg>
                  Busiest nights
                  <span className="ml-auto text-[0.68rem] text-[var(--fg-faint)] font-normal">avg attendance</span>
                </div>
                <div className="px-5 pt-4 pb-5">
                  <div className="flex items-end gap-2 h-[120px]">
                    {(data.busiestNights ?? []).map(({ day, pct, count }) => (
                      <div
                        key={day}
                        className="flex-1 flex flex-col items-center gap-1.5"
                        title={`${day}: ${count} entries`}
                      >
                        <div className="w-full flex flex-col justify-end" style={{ height: 96 }}>
                          <div
                            className="w-full rounded-t-sm transition-all"
                            style={{
                              height: `${Math.max(pct, 4)}%`,
                              background: pct > 70 ? "var(--xiv-blue)" : "rgba(0,180,255,0.35)",
                            }}
                          />
                        </div>
                        <span className="text-[0.65rem] text-muted-foreground font-medium">{day.charAt(0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Financial Overview — below charts */}
        {analyticsData?.financial && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 text-[var(--xiv-blue)]"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              <h2 className="font-cinzel text-lg font-bold tracking-[0.02em]">Financial Overview</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="px-[18px] py-4">
                <StatReadout
                  label="Payroll expenses"
                  value={`${Math.round(data.financial.totalPayroll).toLocaleString("en-US")} gil`}
                  subtext={`${data.financial.payrollAsPercentOfRevenue.toFixed(1)}% of revenue`}
                  icon={<DollarSign />}
                  iconVariant="blue"
                />
              </Card>
              <Card className="px-[18px] py-4">
                <StatReadout
                  label="Net profit / loss"
                  value={`${data.financial.netProfit >= 0 ? "+" : ""}${Math.round(data.financial.netProfit).toLocaleString("en-US")} gil`}
                  subtext="revenue minus payroll"
                  deltaDirection={data.financial.netProfit >= 0 ? "up" : "down"}
                  icon={<TrendingUp />}
                  iconVariant={data.financial.netProfit >= 0 ? "success" : "warning"}
                />
              </Card>
              <Card className="px-[18px] py-4">
                <StatReadout
                  label="Profit margin"
                  value={`${data.financial.profitMargin.toFixed(1)}%`}
                  subtext={
                    data.financial.profitMargin >= 50
                      ? "Healthy"
                      : data.financial.profitMargin >= 25
                        ? "Moderate"
                        : "Low"
                  }
                  icon={<Target />}
                  iconVariant="blue"
                />
              </Card>
            </div>
          </div>
        )}

        {/* Followers — below charts */}
        {analyticsData?.followers && (
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <svg
                className="w-4 h-4 text-[var(--xiv-blue)]"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              <h2 className="font-cinzel text-lg font-bold tracking-[0.02em]">Followers</h2>
            </div>
            <div className="kpis">
              <Card className="px-[18px] py-4">
                <StatReadout
                  label="Total followers"
                  value={data.followers?.total ?? 0}
                  subtext="app users following"
                  icon={<Users />}
                  iconVariant="blue"
                />
              </Card>
              {Object.entries(data.followers?.byMonth ?? {}).map(([month, count]) => (
                <Card key={month} className="p-4">
                  <StatReadout
                    label={<LocalTime date={`${month}-01`} formatStr="monthyear" />}
                    value={`+${count as number}`}
                    subtext="new followers"
                  />
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </VenueLayoutClient>
  )
}
