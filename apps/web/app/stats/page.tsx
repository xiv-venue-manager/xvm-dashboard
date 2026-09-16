import type { Metadata } from "next"
import Link from "next/link"
import {
  Building2,
  Radio,
  Users,
  Coins,
  Globe,
  BarChart3,
  Shapes,
  Calendar,
  ArrowRight,
  ArrowUp,
  Clock,
} from "lucide-react"
import { getPublicStats } from "@/lib/public-stats"

export const revalidate = 60

export const metadata: Metadata = {
  title: "Usage stats",
  description: "Live aggregate usage stats: venues, events, patrons and gil tracked across the FFXIV venue community.",
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}b`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`
  return n.toLocaleString("en-US")
}

export default async function StatsPage() {
  const stats = await getPublicStats().catch(() => null)

  if (!stats) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="page-h1 mb-3">Stats unavailable</h1>
          <p className="text-muted-foreground">Try again in a moment.</p>
        </div>
      </div>
    )
  }

  const todayDOW = new Date().getUTCDay() // 0=Sun
  const maxDC = stats.dcBreakdown[0]?.count || 1

  const venueTypes =
    stats.venueTypeBreakdown.length > 0 ? stats.venueTypeBreakdown : ([] as Array<{ label: string; pct: number }>)

  return (
    <div className="min-h-screen">
      {/* ── Stats hero ── */}
      <section className="stats-hero relative overflow-hidden pt-[120px] pb-[56px] text-center border-b border-[var(--blue-008)]">
        <div className="absolute inset-0 bg-[url('/starfield.webp')] bg-center bg-cover opacity-[0.18]" />
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse 70% 70% at 50% 30%, transparent, var(--background) 80%)" }}
        />
        <div className="relative z-10 max-w-[1080px] mx-auto px-8">
          {/* Crystal row */}
          <div className="flex items-center justify-center gap-[14px] mb-5">
            <span className="h-px flex-1 max-w-[80px] bg-gradient-to-r from-transparent to-[var(--xiv-blue)]" />
            <span className="w-[9px] h-[9px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_12px_rgba(0,180,255,0.5)]" />
            <span className="h-px flex-1 max-w-[80px] bg-gradient-to-l from-transparent to-[var(--xiv-blue)]" />
          </div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[var(--xiv-blue)] mb-[14px]">
            Community stats
          </p>
          <h1 className="font-cinzel font-bold text-[clamp(2.2rem,4vw,3rem)] tracking-[0.02em] xiv-glow-text">
            The realm, by the numbers
          </h1>

          {/* 4 bignums */}
          <div className="bignums grid grid-cols-2 lg:grid-cols-4 gap-4 mt-[44px]">
            {[
              {
                icon: <Building2 className="w-5 h-5" />,
                value: fmtCompact(stats.venuesTotal),
                label: "Venues",
                live: false,
              },
              {
                icon: <Radio className="w-5 h-5" />,
                value: fmtCompact(stats.venuesActive30d),
                label: "Active this month",
                live: true,
              },
              {
                icon: <Users className="w-5 h-5" />,
                value: fmtCompact(stats.patronEntriesTotal),
                label: "Patrons tracked",
                live: false,
              },
              {
                icon: <Coins className="w-5 h-5" />,
                value: fmtCompact(stats.gilTracked),
                label: "Gil logged",
                live: false,
              },
            ].map(({ icon, value, label, live }) => (
              <div
                key={label}
                className="bignum bg-[var(--card)] border border-[var(--blue-018)] rounded-[var(--radius-xl)] p-[26px_20px] hover:border-[var(--blue-045)] hover:shadow-[0_0_20px_rgba(0,180,255,0.07),inset_0_1px_0_rgba(0,180,255,0.12)] hover:-translate-y-0.5 transition-all duration-[250ms]"
              >
                <div
                  className={`ic w-10 h-10 rounded-[var(--radius-md)] grid place-items-center mx-auto mb-[14px] border ${live ? "bg-[var(--success-soft)] border-[rgba(16,185,129,0.25)] text-[var(--success-text)]" : "bg-[var(--blue-010)] border-[var(--blue-018)] text-[var(--xiv-blue)]"}`}
                >
                  {icon}
                </div>
                <div
                  className={`v font-cinzel font-bold text-[clamp(1.8rem,3vw,2.4rem)] leading-none tracking-[0.01em] ${live ? "text-[var(--success-text)]" : ""}`}
                >
                  {value}
                  {live && (
                    <span className="pip inline-block w-[7px] h-[7px] rounded-full bg-[var(--success-text)] ml-1.5 relative align-middle animate-ping" />
                  )}
                </div>
                <div className="k text-[0.72rem] uppercase tracking-[0.12em] text-[var(--fg-faint)] font-semibold mt-[10px]">
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 1: Across the realm ── */}
      <section className="py-[50px] border-b border-[var(--blue-008)]">
        <div className="max-w-[1080px] mx-auto px-8">
          <div className="sec-head mb-[30px]">
            <h2 className="font-cinzel font-bold text-[var(--text-section,clamp(1.75rem,2.5vw+.75rem,2.75rem))] tracking-[0.02em]">
              Across the realm
            </h2>
            <p className="text-muted-foreground text-[0.98rem] mt-2">
              Where venues run, and when the realm comes alive.
            </p>
          </div>
          <div className="cols2 grid grid-cols-1 md:grid-cols-2 gap-[18px] items-start">
            {/* Top data centres */}
            <section className="panel">
              <div className="ph flex items-center gap-3 px-5 py-4 border-b border-[var(--blue-008)]">
                <span className="pt font-[var(--font-outfit)] font-semibold text-[0.95rem] flex items-center gap-2">
                  <Globe className="w-[17px] h-[17px] text-[var(--xiv-blue)]" /> Top data centres
                </span>
                <div className="flex-1" />
                <span className="pcount text-[0.74rem] text-[var(--fg-faint)]">by venues</span>
              </div>
              {stats.dcBreakdown.slice(0, 6).map(({ dataCenter, count }) => (
                <div
                  key={dataCenter}
                  className="dcrow px-5 py-[14px] border-t border-[var(--blue-008)] first:border-t-0"
                >
                  <div className="top flex justify-between text-[0.88rem] mb-2">
                    <span className="nm font-medium">{dataCenter}</span>
                    <span className="ct text-muted-foreground tabular-nums">
                      {count} venue{count !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="progress h-2 rounded-full bg-[var(--blue-010)] overflow-hidden">
                    <div
                      className="pf h-full rounded-full"
                      style={{
                        width: `${Math.round((count / maxDC) * 100)}%`,
                        background: "linear-gradient(90deg, var(--xiv-blue), rgba(0,180,255,0.55))",
                      }}
                    />
                  </div>
                </div>
              ))}
            </section>

            {/* Busiest nights */}
            <section className="panel">
              <div className="ph flex items-center gap-3 px-5 py-4 border-b border-[var(--blue-008)]">
                <span className="pt font-[var(--font-outfit)] font-semibold text-[0.95rem] flex items-center gap-2">
                  <BarChart3 className="w-[17px] h-[17px] text-[var(--xiv-blue)]" /> Busiest nights
                </span>
                <div className="flex-1" />
                <span className="pcount text-[0.74rem] text-[var(--fg-faint)]">venues open</span>
              </div>
              <div className="chart flex items-end gap-[10px] h-[200px] px-[22px] pb-4 pt-6">
                {stats.busiestNights.map(({ day, pct }, i) => {
                  const isToday = i === todayDOW
                  return (
                    <div key={day} className="bar flex flex-col items-center gap-[9px] flex-1 h-full justify-end">
                      <div
                        className="col w-full max-w-[30px] rounded-t-[5px] rounded-b-[2px] transition-all hover:brightness-125"
                        style={{
                          height: `${Math.max(pct, 4)}%`,
                          background: isToday
                            ? "linear-gradient(180deg, var(--xiv-blue), rgba(0,180,255,0.45))"
                            : "linear-gradient(180deg, var(--xiv-blue), rgba(0,180,255,0.25))",
                          boxShadow: isToday ? "0 0 12px rgba(0,180,255,0.35)" : undefined,
                        }}
                      />
                      <span
                        className={`bl text-[0.66rem] ${isToday ? "text-[var(--xiv-blue)] font-semibold" : "text-[var(--fg-faint)]"}`}
                      >
                        {day}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>
        </div>
      </section>

      {/* ── Section 2: What the realm runs ── */}
      <section className="py-[50px] bg-[#060b16] border-b border-[var(--blue-008)]">
        <div className="max-w-[1080px] mx-auto px-8">
          <div className="sec-head mb-[30px]">
            <h2 className="font-cinzel font-bold text-[var(--text-section,clamp(1.75rem,2.5vw+.75rem,2.75rem))] tracking-[0.02em]">
              What the realm runs
            </h2>
            <p className="text-muted-foreground text-[0.98rem] mt-2">
              The kinds of venues hosts are building, and this week&apos;s activity.
            </p>
          </div>
          <div className="cols2 grid grid-cols-1 md:grid-cols-2 gap-[18px] items-start">
            {/* Venue types */}
            <section className="panel">
              <div className="ph flex items-center gap-3 px-5 py-4 border-b border-[var(--blue-008)]">
                <span className="pt font-[var(--font-outfit)] font-semibold text-[0.95rem] flex items-center gap-2">
                  <Shapes className="w-[17px] h-[17px] text-[var(--xiv-blue)]" /> Venue types
                </span>
              </div>
              {venueTypes.map(({ label, pct }) => (
                <div
                  key={label}
                  className="mixrow flex items-center gap-3 px-5 py-3 border-t border-[var(--blue-008)] first:border-t-0"
                >
                  <span className="ml w-[92px] text-[0.85rem] flex-shrink-0">{label}</span>
                  <div className="mb flex-1 h-[9px] rounded-full bg-[var(--blue-010)] overflow-hidden">
                    <div className="mf h-full rounded-full bg-[var(--xiv-blue)]" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="mv w-[44px] text-right text-[0.82rem] text-muted-foreground tabular-nums">
                    {pct}%
                  </span>
                </div>
              ))}
            </section>

            {/* Right: weekly stats + all-time events */}
            <div className="flex flex-col gap-4">
              <div className="week grid grid-cols-3 gap-4">
                {[
                  { v: fmtCompact(stats.eventsThisWeek), k: "Events this week", d: "+this week" },
                  { v: fmtCompact(stats.shiftsThisWeek), k: "Shifts clocked", d: "+this week" },
                  { v: `+${stats.newVenuesThisWeek}`, k: "New venues", d: "this week" },
                ].map(({ v, k, d }) => (
                  <div
                    key={k}
                    className="wstat bg-[var(--card)] border border-[var(--blue-018)] rounded-[var(--radius-lg)] p-5 text-center"
                  >
                    <div className="v font-[var(--font-outfit)] font-bold text-[1.8rem] leading-none">{v}</div>
                    <div className="k text-[0.74rem] uppercase tracking-[0.1em] text-[var(--fg-faint)] font-semibold mt-[6px]">
                      {k}
                    </div>
                    <div className="d flex items-center justify-center gap-1 text-[0.74rem] text-[var(--success-text)] mt-2">
                      <ArrowUp className="w-3 h-3" /> {d}
                    </div>
                  </div>
                ))}
              </div>

              <section className="panel">
                <div className="ph flex items-center gap-3 px-5 py-4 border-b border-[var(--blue-008)]">
                  <span className="pt font-[var(--font-outfit)] font-semibold text-[0.95rem] flex items-center gap-2">
                    <Calendar className="w-[17px] h-[17px] text-[var(--xiv-blue)]" /> All-time events hosted
                  </span>
                </div>
                <div className="flex items-baseline gap-3 px-5 py-[22px]">
                  <span className="font-cinzel font-bold text-[2.4rem] leading-none">
                    {fmtCompact(stats.eventsTotal)}
                  </span>
                  <span className="text-muted-foreground text-[0.9rem]">events tracked</span>
                </div>
                <div className="flex items-center gap-2 px-5 pb-5 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4 text-[var(--xiv-blue)]" />
                  {fmtCompact(stats.shiftsTotal)} shifts · {fmtCompact(stats.tasksCompleted)} tasks completed
                </div>
              </section>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA band ── */}
      <section className="py-[60px] text-center">
        <div className="max-w-[1080px] mx-auto px-8">
          <div className="flex items-center justify-center gap-[14px] mb-5">
            <span className="h-px flex-1 max-w-[80px] bg-gradient-to-r from-transparent to-[var(--xiv-blue)]" />
            <span className="w-[9px] h-[9px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_12px_rgba(0,180,255,0.5)]" />
            <span className="h-px flex-1 max-w-[80px] bg-gradient-to-l from-transparent to-[var(--xiv-blue)]" />
          </div>
          <h2 className="font-cinzel font-bold text-[var(--text-section,clamp(1.75rem,2.5vw+.75rem,2.75rem))] tracking-[0.02em] mt-[18px]">
            Add your venue to the count
          </h2>
          <p className="text-muted-foreground text-[1.02rem] mt-[14px] mb-6 mx-auto max-w-[46ch]">
            Join {fmtCompact(stats.venuesTotal)} venues already running on XIV Venue Manager. Free, forever.
          </p>
          <Link
            href="/auth/signin"
            className="xiv-btn-shimmer xiv-cta inline-flex items-center gap-2 px-[26px] py-[14px] rounded-[var(--radius-md)] font-semibold text-[1rem]"
          >
            Get Started Free <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  )
}
