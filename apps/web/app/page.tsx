import Link from "next/link"
import Image from "next/image"
import { getPublicStats } from "@/lib/public-stats"

export const revalidate = 60

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US").format(n)
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`
  return fmt(n)
}

function relTime(iso: string | null): string {
  if (!iso) return "—"
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}
import { Button } from "@/components/ui/button"
import { ShoppingBag, Banknote, Building2, Lock, Smartphone, Bell, Link2, CheckCircle2, ArrowRight } from "lucide-react"

function IconBadge({
  children,
  tone = "primary",
  size = "md",
}: {
  children: React.ReactNode
  tone?: "primary" | "emerald"
  size?: "sm" | "md" | "lg" | "xl"
}) {
  const toneClasses =
    tone === "emerald" ? "bg-emerald-500/10 text-emerald-500" : "bg-[rgba(0,180,255,0.1)] text-[var(--xiv-blue)]"
  const sizeClasses = {
    sm: "w-10 h-10 rounded-lg",
    md: "w-12 h-12 rounded-lg",
    lg: "w-16 h-16 rounded-2xl",
    xl: "w-20 h-20 rounded-2xl",
  }[size]
  return <div className={`inline-flex items-center justify-center ${sizeClasses} ${toneClasses}`}>{children}</div>
}

export default async function Home() {
  const stats = await getPublicStats().catch(() => null)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "XIV Venue Manager",
    applicationCategory: "GameApplication",
    operatingSystem: "Web Browser, Windows (Dalamud plugin)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    description:
      "Free venue management for FFXIV roleplay venues. Track events, manage staff, log sales and go live from the web or inside the game.",
    url: "https://xivvenuemanager.com",
    screenshot: "https://xivvenuemanager.com/og-image.png",
  }

  return (
    <div className="min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <link rel="preload" href="/starfield.webp" as="image" fetchPriority="high" />
      {/* Hero Section */}
      <section className="xiv-hero-bg overflow-hidden">
        <div className="container mx-auto px-4 pt-[120px] pb-[70px]">
          <div className="flex flex-col items-center text-center space-y-8">
            {/* Crystal row + eyebrow — matching prototype mk-hero structure */}
            <div className="flex flex-col items-center gap-3 xiv-fade-up">
              <div className="flex items-center justify-center gap-3.5">
                <span className="h-px w-16 bg-gradient-to-r from-transparent to-[var(--xiv-blue)]" />
                <span className="w-[9px] h-[9px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_12px_rgba(0,180,255,0.5)]" />
                <span className="h-px w-16 bg-gradient-to-l from-transparent to-[var(--xiv-blue)]" />
              </div>
              <p className="text-[0.74rem] font-semibold uppercase tracking-[0.16em] text-[var(--xiv-blue)]">
                For FFXIV roleplay venue hosts
              </p>
            </div>
            <h1 className="font-cinzel font-bold text-hero max-w-[16ch] leading-[1.08] tracking-[0.01em]">
              Venue management built for <span className="xiv-glow-text">FFXIV</span>
            </h1>

            <a
              href="https://frogge.tech/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 text-base text-muted-foreground bg-[var(--blue-007)] border border-[var(--blue-015)] rounded-full px-5 py-2.5 hover:text-foreground hover:border-[var(--blue-035)] transition-colors"
            >
              <Image src="/frogge-icon.png" alt="" width={24} height={24} className="rounded-sm" />
              Powered by Frogge
            </a>

            <p className="xiv-fade-up-delay-1 text-xl md:text-2xl text-muted-foreground max-w-2xl">
              Track events, log sales, and manage staff from a web dashboard or inside FFXIV via Dalamud.
            </p>

            <div className="xiv-fade-up-delay-2 flex flex-col sm:flex-row gap-4 mt-4">
              <Button asChild size="lg" className="xiv-btn-shimmer xiv-cta text-lg px-8 py-6 group font-semibold">
                <Link href="/get-started">
                  Get Started Free
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="text-lg px-8 py-6 border-[var(--xiv-blue-border)] hover:bg-[var(--xiv-blue-dim)] hover:border-[var(--xiv-blue)]"
              >
                <Link href="#features">See Features</Link>
              </Button>
            </div>

            <p className="xiv-fade-up-delay-2 text-sm text-muted-foreground">Sign in with Discord to get started.</p>
          </div>

          {/* Product preview frame */}
          <div className="mt-14 max-w-[840px] mx-auto w-full xiv-fade-up-delay-2">
            <div className="rounded-xl overflow-hidden border border-[rgba(0,180,255,0.2)] bg-[var(--card)] shadow-[0_30px_80px_rgba(0,0,0,0.5),0_0_60px_rgba(0,180,255,0.08)]">
              {/* Browser chrome bar */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--blue-008)] bg-[rgba(7,11,20,0.6)]">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--border)]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--border)]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--border)]" />
                <span className="ml-3 font-mono text-[0.74rem] text-[var(--fg-faint)]">xivvenuemanager.com / live</span>
              </div>
              {/* Preview body */}
              <div className="p-5 grid grid-cols-1 sm:grid-cols-[1.3fr_1fr] gap-4">
                {/* Session bar — full width */}
                <div className="sm:col-span-2 flex items-center gap-4 flex-wrap px-4 py-3.5 rounded-lg border border-[var(--blue-015)] pv-sess-bg">
                  <span className="inline-flex items-center gap-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[var(--success-text)]">
                    <span className="xiv-live-dot scale-90" />
                    Live now
                  </span>
                  <span className="font-cinzel font-bold text-[1.15rem]">Open Mic Night</span>
                  <div className="flex-1" />
                  <span className="font-mono text-[1.1rem]">01:23:47</span>
                </div>
                {/* Stat cards */}
                <div className="bg-background border border-[var(--blue-015)] rounded-lg px-4 py-3.5">
                  <p className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-[var(--fg-faint)]">
                    In venue now
                  </p>
                  <p className="font-[var(--font-outfit)] font-bold text-[1.4rem] mt-1.5">24</p>
                </div>
                <div className="bg-background border border-[var(--blue-015)] rounded-lg px-4 py-3.5">
                  <p className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-[var(--fg-faint)]">
                    Sales tonight
                  </p>
                  <p className="font-[var(--font-outfit)] font-bold text-[1.4rem] mt-1.5 text-[var(--xiv-blue)]">
                    47,500 gil
                  </p>
                </div>
                {/* Activity feed — full width */}
                <div className="sm:col-span-2 bg-background border border-[var(--blue-015)] rounded-lg overflow-hidden">
                  {[
                    {
                      icon: "enter",
                      label: (
                        <>
                          <strong>Seraphine Valois</strong> entered the venue
                        </>
                      ),
                      time: "just now",
                      blue: false,
                    },
                    {
                      icon: "sale",
                      label: (
                        <>
                          K&apos;tani logged a sale:{" "}
                          <span className="text-[var(--xiv-blue)] font-semibold">500 gil</span>
                        </>
                      ),
                      time: "1m ago",
                      blue: true,
                    },
                  ].map(({ label, time, blue }, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2.5 px-4 py-2.5 text-[0.8rem] ${i > 0 ? "border-t border-[var(--blue-008)]" : ""}`}
                    >
                      <span
                        className={`w-[26px] h-[26px] rounded flex items-center justify-center flex-shrink-0 ${blue ? "bg-[var(--blue-010)] text-[var(--xiv-blue)] border border-[var(--blue-018)]" : "bg-[var(--success-soft)] text-[var(--success-text)] border border-[rgba(16,185,129,0.25)]"}`}
                      >
                        {blue ? (
                          <svg
                            className="w-3.5 h-3.5"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <line x1="12" y1="1" x2="12" y2="23" />
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                          </svg>
                        ) : (
                          <svg
                            className="w-3.5 h-3.5"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                            <polyline points="10 17 15 12 10 7" />
                            <line x1="15" y1="12" x2="3" y2="12" />
                          </svg>
                        )}
                      </span>
                      <span className="flex-1">{label}</span>
                      <span className="text-[0.72rem] text-[var(--fg-faint)] ml-auto">{time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social proof strip — live aggregates */}
      <section className="border-y border-[rgba(0,180,255,0.1)] bg-[#060b16]">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-0 text-sm text-muted-foreground text-center">
            {stats ? (
              <>
                <span>
                  <span className="font-semibold text-foreground tabular-nums">{fmt(stats.venuesActive30d)}</span>{" "}
                  active venues
                </span>
                <span className="hidden sm:inline mx-4 text-[rgba(0,180,255,0.3)]">|</span>
                <span>
                  <span className="font-semibold text-foreground tabular-nums">{fmt(stats.eventsTotal)}</span> events
                  tracked
                </span>
                <span className="hidden sm:inline mx-4 text-[rgba(0,180,255,0.3)]">|</span>
                <span>
                  <span className="font-semibold text-[var(--xiv-blue)] tabular-nums">
                    {fmtCompact(stats.gilTracked)} gil
                  </span>{" "}
                  flowing through the economy
                </span>
                <span className="hidden sm:inline mx-4 text-[rgba(0,180,255,0.3)]">|</span>
                <span>
                  last activity <span className="font-semibold text-emerald-400">{relTime(stats.lastActivityAt)}</span>
                </span>
              </>
            ) : (
              <span className="opacity-40">Loading usage data&hellip;</span>
            )}
            <span className="hidden sm:inline mx-4 text-[rgba(0,180,255,0.3)]">|</span>
            <Link
              href="/stats"
              className="hover:text-[var(--xiv-blue)] transition-colors inline-flex items-center gap-1"
            >
              Full stats <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* Features — 3x2 feat-card grid matching prototype */}
      <section id="features" className="container mx-auto px-4 py-20 md:py-24">
        <div className="text-center mb-14 xiv-scroll-reveal">
          <div className="xiv-divider">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <rect x="6" y="0" width="8.485" height="8.485" transform="rotate(45 6 0)" fill="rgba(0,180,255,0.7)" />
            </svg>
          </div>
          <h2 className="font-cinzel text-section font-bold tracking-wide mt-4">Everything your venue needs</h2>
          <p className="text-muted-foreground mt-4 max-w-[52ch] mx-auto leading-relaxed">
            Replace the tangle of spreadsheets, Discord bots and calendars with one platform made for FFXIV roleplay
            venues.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[18px]">
          {[
            {
              icon: (
                <>
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </>
              ),
              color: "em",
              title: "Live patron tracking",
              desc: "See who's in your venue in real time. Arrivals, departures, and headcount stream in as the night unfolds.",
            },
            {
              icon: (
                <>
                  <rect x="6" y="2" width="12" height="20" rx="2" />
                  <line x1="12" y1="18" x2="12" y2="18" />
                </>
              ),
              color: "",
              title: "Dalamud plugin sync",
              desc: "Log sales and clock shifts without leaving the game. /xvm sale 500 syncs to your dashboard instantly.",
            },
            {
              icon: (
                <>
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </>
              ),
              color: "",
              title: "Partner integrations",
              desc: "Pull live events and attendee counts from Partake.gg. Sync your schedule from ffxivvenues.com and show live Open Now status.",
            },
            {
              icon: (
                <>
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </>
              ),
              color: "",
              title: "Staff & shifts",
              desc: "Schedule shifts, track clock-ins and keep your hosts, bartenders and DJs organised in one roster.",
            },
            {
              icon: (
                <>
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </>
              ),
              color: "",
              title: "Sales & payroll",
              desc: "Tally gil, pool tips, and run payroll by the hour. Every sale is tied to the staff member who logged it.",
            },
            {
              icon: (
                <>
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </>
              ),
              color: "pink",
              title: "Free & community-built",
              desc: "Made by venue owners, for venue owners. No paid tiers, no upsells. Support it on Ko-fi if it helps.",
            },
          ].map(({ icon, color, title, desc }) => (
            <div
              key={title}
              className="rounded-xl border border-[var(--blue-018)] bg-[var(--card)] p-6 transition-all duration-[250ms] hover:border-[rgba(0,180,255,0.45)] hover:shadow-[0_0_20px_rgba(0,180,255,0.07),inset_0_1px_0_rgba(0,180,255,0.12)] hover:-translate-y-0.5 xiv-scroll-reveal"
            >
              <div
                className={`w-[52px] h-[52px] rounded-xl flex items-center justify-center mb-[18px] ${
                  color === "em"
                    ? "bg-[var(--success-soft)] border border-[rgba(16,185,129,0.25)] text-[var(--success-text)]"
                    : color === "pink"
                      ? "bg-[rgba(243,139,168,0.10)] border border-[rgba(243,139,168,0.25)] text-[var(--support-pink)]"
                      : "bg-[var(--blue-010)] border border-[var(--blue-018)] text-[var(--xiv-blue)]"
                }`}
              >
                <svg
                  className="w-6 h-6"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  {icon}
                </svg>
              </div>
              <h3 className="font-[var(--font-outfit)] font-semibold text-[1.12rem] mb-2">{title}</h3>
              <p className="text-[0.9rem] text-muted-foreground leading-[1.55]">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works — two halves + steps matching prototype */}
      <section id="how" className="border-y border-[var(--blue-008)] bg-[#060b16] py-20 md:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14 xiv-scroll-reveal">
            <div className="flex items-center justify-center gap-3 mb-5">
              <div className="h-px w-14 bg-gradient-to-r from-transparent to-[var(--xiv-blue)]" />
              <div className="w-2 h-2 rotate-45 bg-[rgba(0,180,255,0.7)] shadow-[0_0_12px_rgba(0,180,255,0.5)]" />
              <div className="h-px w-14 bg-gradient-to-l from-transparent to-[var(--xiv-blue)]" />
            </div>
            <h2 className="font-cinzel text-section font-bold tracking-wide">Two halves that sync in real time</h2>
            <p className="text-muted-foreground mt-4 max-w-[52ch] mx-auto leading-relaxed">
              The web dashboard and the in-game plugin talk to each other constantly, so what happens in Eorzea shows up
              on your screen.
            </p>
          </div>

          {/* Halves */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[18px] mb-10">
            {[
              {
                iconPath: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
                title: "Web dashboard",
                sub: "Next.js · any browser",
                items: [
                  "Plan events, manage staff & shifts",
                  "Live mode: watch the room in real time",
                  "Sales, tips, payroll & patron history",
                  "Analytics on your busiest nights",
                ],
              },
              {
                iconPath:
                  "M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v11m0 0h10m-10 0H5m14 0v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-4m14 0H5",
                title: "Dalamud plugin",
                sub: "Runs inside FFXIV",
                items: [
                  "Captures patrons as they enter & leave",
                  "Log a sale with /xvm sale 500",
                  "Clock in and out of shifts in-game",
                  "Everything syncs to the dashboard live",
                ],
              },
            ].map(({ iconPath, title, sub, items }) => (
              <div
                key={title}
                className="rounded-xl border border-[var(--blue-018)] bg-[var(--card)] p-7 xiv-scroll-reveal"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-lg bg-[var(--blue-010)] border border-[var(--blue-018)] flex items-center justify-center text-[var(--xiv-blue)] flex-shrink-0">
                    <svg
                      className="w-5 h-5"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d={iconPath} />
                    </svg>
                  </div>
                  <div>
                    <p className="font-[var(--font-outfit)] font-semibold text-[1.15rem]">{title}</p>
                    <p className="text-[0.78rem] text-[var(--fg-faint)]">{sub}</p>
                  </div>
                </div>
                <ul className="flex flex-col gap-[11px]">
                  {items.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2.5 text-[0.92rem] text-[var(--fg-subtle)] leading-[1.5]"
                    >
                      <svg
                        className="w-[17px] h-[17px] text-[var(--xiv-blue)] flex-shrink-0 mt-0.5"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {item.includes("/xvm") ? (
                        <span>
                          Log a sale with{" "}
                          <code className="font-mono text-[0.82em] text-[var(--xiv-blue)] bg-[var(--blue-010)] px-1.5 py-0.5 rounded">
                            /xvm sale 500
                          </code>
                        </span>
                      ) : (
                        item
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Sync note */}
          <p className="text-center text-[0.92rem] text-muted-foreground flex items-center justify-center gap-2 mb-12">
            <svg
              className="w-4 h-4 text-[var(--success-text)]"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
              <path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Changes sync both ways, instantly.
          </p>

          {/* Steps */}
          <div className="flex flex-col gap-1 max-w-[760px] mx-auto">
            {[
              {
                n: "01",
                title: "Sign in with Discord",
                desc: "Create your venue in 30 seconds. No forms, no credit card. Your Discord account is all you need.",
              },
              {
                n: "02",
                title: "Install the Dalamud plugin",
                desc: "Add the plugin from inside FFXIV to start capturing patrons and logging sales with slash commands.",
              },
              {
                n: "03",
                title: "Run your venue from the dashboard",
                desc: "Open Live Mode on event night. Watch sales, patrons, and shifts in real time and manage everything from one place.",
              },
            ].map(({ n, title, desc }) => (
              <div
                key={n}
                className="grid grid-cols-[5rem_1fr] gap-[22px] py-[22px] border-t border-[var(--blue-008)] items-start xiv-scroll-reveal"
              >
                <div
                  aria-hidden="true"
                  className="font-cinzel font-bold text-[2.6rem] text-[rgba(0,180,255,0.2)] leading-none"
                >
                  {n}
                </div>
                <div>
                  <p className="font-[var(--font-outfit)] font-semibold text-[1.1rem] mb-1.5">{title}</p>
                  <p className="text-[0.92rem] text-muted-foreground leading-[1.55]">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Additional Features */}
      <section className="border-y border-[rgba(0,180,255,0.1)] bg-[#060b16]">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="text-center mb-12 xiv-scroll-reveal">
            <div className="xiv-divider">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <rect x="6" y="0" width="8.485" height="8.485" transform="rotate(45 6 0)" fill="rgba(0,180,255,0.7)" />
              </svg>
            </div>
            <h2 className="font-cinzel text-section font-bold mb-4 tracking-wide">Included</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { icon: ShoppingBag, title: "Service Catalog", blurb: "Define your offerings with prices" },
              { icon: Banknote, title: "Payroll Tracking", blurb: "Track staff earnings and tips" },
              { icon: Building2, title: "Multi-Venue", blurb: "Manage multiple venues" },
              { icon: Lock, title: "Privacy Controls", blurb: "Control what staff can see" },
              { icon: Smartphone, title: "Mobile Friendly", blurb: "Works on any device" },
              { icon: Bell, title: "Discord Webhooks", blurb: "Auto-post events, sales, tasks" },
              { icon: Link2, title: "Partner Integrations", blurb: "Sync with Partake.gg & ffxivvenues.com" },
              { icon: CheckCircle2, title: "Task Management", blurb: "Assign, prioritize, track" },
            ].map(({ icon: Icon, title, blurb }) => (
              <div key={title} className="space-y-2 flex flex-col items-center xiv-scroll-reveal">
                <IconBadge>
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </IconBadge>
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground">{blurb}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Partners */}
      <section className="border-y border-[var(--blue-008)] bg-[#060b16] py-20 md:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14 xiv-scroll-reveal">
            <div className="xiv-divider">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <rect x="6" y="0" width="8.485" height="8.485" transform="rotate(45 6 0)" fill="rgba(0,180,255,0.7)" />
              </svg>
            </div>
            <h2 className="font-cinzel text-section font-bold mb-4 tracking-wide">Partners</h2>
            <p className="text-muted-foreground max-w-[52ch] mx-auto leading-relaxed">
              XIV Venue Manager integrates with community tools built by fellow FFXIV players.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-[18px] max-w-3xl mx-auto">
            {/* Partake.gg */}
            <a
              href="https://partake.gg"
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-xl border border-[var(--blue-018)] bg-[var(--card)] p-7 flex flex-col gap-5 transition-all duration-[250ms] hover:border-[rgba(0,180,255,0.45)] hover:shadow-[0_0_20px_rgba(0,180,255,0.07),inset_0_1px_0_rgba(0,180,255,0.12)] hover:-translate-y-0.5 xiv-scroll-reveal"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-[#141520] flex items-center justify-center">
                  <Image
                    src="/partners/partake-logo.png"
                    alt="Partake.gg"
                    width={56}
                    height={56}
                    className="object-contain"
                  />
                </div>
                <div>
                  <p className="font-[var(--font-outfit)] font-semibold text-[1.1rem]">Partake.gg</p>
                  <p className="text-[0.78rem] text-[var(--xiv-blue)]">Event discovery for FFXIV</p>
                </div>
              </div>
              <p className="text-[0.88rem] text-muted-foreground leading-[1.6]">
                The community event calendar for FFXIV. XIV Venue Manager pulls your events and attendee counts from
                Partake so venue profiles stay current automatically.
              </p>
              <div className="mt-auto">
                <div className="text-[0.78rem] text-[var(--fg-faint)] font-medium uppercase tracking-wide mb-2">
                  We use
                </div>
                <div className="flex flex-wrap gap-2">
                  {["Event sync", "Attendee count"].map((t) => (
                    <span
                      key={t}
                      className="text-[0.75rem] px-2.5 py-1 rounded-full border border-[var(--blue-015)] bg-[var(--blue-008)] text-[var(--xiv-blue)]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[0.8rem] text-[var(--xiv-blue)] group-hover:underline">
                Visit Partake.gg
                <svg
                  className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
            </a>

            {/* ffxivvenues.com */}
            <a
              href="https://ffxivvenues.com"
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-xl border border-[var(--blue-018)] bg-[var(--card)] p-7 flex flex-col gap-5 transition-all duration-[250ms] hover:border-[rgba(0,180,255,0.45)] hover:shadow-[0_0_20px_rgba(0,180,255,0.07),inset_0_1px_0_rgba(0,180,255,0.12)] hover:-translate-y-0.5 xiv-scroll-reveal"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-black flex items-center justify-center">
                  <Image
                    src="/partners/ffxivvenues-logo.png"
                    alt="FFXIV Venues"
                    width={56}
                    height={56}
                    className="object-contain"
                  />
                </div>
                <div>
                  <p className="font-[var(--font-outfit)] font-semibold text-[1.1rem]">ffxivvenues.com</p>
                  <p className="text-[0.78rem] text-[var(--xiv-blue)]">Venue directory for FFXIV</p>
                </div>
              </div>
              <p className="text-[0.88rem] text-muted-foreground leading-[1.6]">
                The definitive venue listing site for FFXIV. Link your listing to sync your opening schedule directly to
                your XIV Venue Manager profile.
              </p>
              <div className="mt-auto">
                <div className="text-[0.78rem] text-[var(--fg-faint)] font-medium uppercase tracking-wide mb-2">
                  We use
                </div>
                <div className="flex flex-wrap gap-2">
                  {["Schedule sync", "Open Now status"].map((t) => (
                    <span
                      key={t}
                      className="text-[0.75rem] px-2.5 py-1 rounded-full border border-[var(--blue-015)] bg-[var(--blue-008)] text-[var(--xiv-blue)]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[0.8rem] text-[var(--xiv-blue)] group-hover:underline">
                Visit ffxivvenues.com
                <svg
                  className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
            </a>

            {/* Frogge */}
            <a
              href="https://frogge.tech"
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-xl border border-[var(--blue-018)] bg-[var(--card)] p-7 flex flex-col gap-5 transition-all duration-[250ms] hover:border-[rgba(0,180,255,0.45)] hover:shadow-[0_0_20px_rgba(0,180,255,0.07),inset_0_1px_0_rgba(0,180,255,0.12)] hover:-translate-y-0.5 xiv-scroll-reveal"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-black flex items-center justify-center">
                  <Image
                    src="/partners/frogge-logo.png"
                    alt="Frogge"
                    width={56}
                    height={56}
                    className="object-contain"
                  />
                </div>
                <div>
                  <p className="font-[var(--font-outfit)] font-semibold text-[1.1rem]">Frogge</p>
                  <p className="text-[0.78rem] text-[var(--xiv-blue)]">Discord Management for Venues</p>
                </div>
              </div>
              <p className="text-[0.88rem] text-muted-foreground leading-[1.6]">
                A comprehensive Discord application for managing all FFXIV venue-related needs in the comfort of your
                own server.
              </p>
              <div className="mt-auto">
                <div className="text-[0.78rem] text-[var(--fg-faint)] font-medium uppercase tracking-wide mb-2">
                  Frogge provides
                </div>
                <div className="flex flex-wrap gap-2">
                  {["VIP Management", "Staff Tracking", "Schedule/Event Sync", "Lodestone Verification"].map((t) => (
                    <span
                      key={t}
                      className="text-[0.75rem] px-2.5 py-1 rounded-full border border-[var(--blue-015)] bg-[var(--blue-008)] text-[var(--xiv-blue)]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[0.8rem] text-[var(--xiv-blue)] group-hover:underline">
                Visit Frogge
                <svg
                  className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
            </a>
          </div>
        </div>
      </section>

      {/* Free band — matches reference exactly */}
      <section className="container mx-auto px-4 py-20 md:py-24">
        <div className="text-center xiv-scroll-reveal">
          <div className="flex items-center justify-center gap-3 mb-5">
            <div className="h-px w-14 bg-gradient-to-r from-transparent to-[var(--xiv-blue)]" />
            <div className="w-2 h-2 rotate-45 bg-[rgba(0,180,255,0.7)] crystal-glow" />
            <div className="h-px w-14 bg-gradient-to-l from-transparent to-[var(--xiv-blue)]" />
          </div>
          <h2 className="font-cinzel text-section font-bold tracking-wide mt-4">Free for the whole community</h2>
          <p className="text-muted-foreground text-[1.05rem] leading-relaxed max-w-[50ch] mx-auto mt-4 mb-6">
            XIV Venue Manager is built and maintained by venue owners. It&apos;s free to use, with no paid tiers. If it
            helps your venue, you can support the project on Ko-fi.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Button asChild size="lg" className="xiv-btn-shimmer xiv-cta text-lg px-8 py-6 group">
              <Link href="/get-started">
                Start Managing Your Venue
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Link
              href="https://ko-fi.com/ehnocure"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-[var(--support-pink)] hover:text-pink-300 border border-[rgba(243,139,168,0.28)] bg-[rgba(243,139,168,0.08)] hover:bg-[rgba(243,139,168,0.16)] hover:border-[rgba(243,139,168,0.5)] transition-colors rounded-lg px-6 py-3 text-[1rem] font-semibold"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 1.9 5 5.2 5c2 0 3.3 1.2 3.8 2.2C9.5 6.2 10.8 5 12.8 5 16.1 5 17.6 8.4 16 11.7 13.5 16.4 12 21 12 21z" />
              </svg>
              Support on Ko-fi
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--blue-008)]">
        <div className="container mx-auto px-4 pt-12 pb-8">
          {/* 4-col grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr] gap-10 mb-10">
            {/* Brand col */}
            <div>
              <Link href="/" className="flex items-center gap-2.5 mb-4">
                <Image src="/xiv-icon.png" alt="" width={28} height={28} className="object-contain" />
                <span className="font-cinzel font-bold tracking-wide text-sm">
                  <span className="text-xiv">XIV</span> <span className="text-foreground/80">Venue Manager</span>
                </span>
              </Link>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-[240px]">
                The all-in-one toolset for running roleplay venues in Final Fantasy XIV.
              </p>
              <Link
                href="https://ko-fi.com/ehnocure"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-sm text-[var(--support-pink)] hover:text-pink-300 transition-colors"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 1.9 5 5.2 5c2 0 3.3 1.2 3.8 2.2C9.5 6.2 10.8 5 12.8 5 16.1 5 17.6 8.4 16 11.7 13.5 16.4 12 21 12 21z" />
                </svg>
                Support on Ko-fi
              </Link>
            </div>

            {/* Product */}
            <div>
              <h3 className="text-sm font-semibold mb-4">Product</h3>
              <div className="space-y-2.5">
                {[
                  { label: "Features", href: "/#features" },
                  { label: "How it works", href: "/#how" },
                  { label: "Dashboard", href: "/dashboard" },
                  { label: "Discover venues", href: "/discover" },
                  { label: "Usage stats", href: "/stats" },
                ].map(({ label, href }) => (
                  <Link
                    key={href}
                    href={href}
                    className="block text-sm text-muted-foreground hover:text-[var(--xiv-blue)] transition-colors"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Resources */}
            <div>
              <h3 className="text-sm font-semibold mb-4">Resources</h3>
              <div className="space-y-2.5">
                {[
                  { label: "Getting started", href: "/guide/getting-started" },
                  { label: "Running events", href: "/guide/events" },
                  { label: "Promoting your venue", href: "/guide/promoting" },
                  { label: "Managing staff", href: "/guide/staff-management" },
                  { label: "Owner guide", href: "/guide/owner" },
                  { label: "Staff guide", href: "/guide/staff" },
                  { label: "FAQ", href: "/guide/owner#faq" },
                  { label: "Privacy policy", href: "/privacy" },
                  { label: "Terms of use", href: "/terms" },
                ].map(({ label, href }) => (
                  <Link
                    key={href}
                    href={href}
                    className="block text-sm text-muted-foreground hover:text-[var(--xiv-blue)] transition-colors"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Community */}
            <div>
              <h3 className="text-sm font-semibold mb-4">Community</h3>
              <div className="space-y-2.5">
                {[
                  { label: "Discord", href: "https://discord.gg/AN5VDNSe2A" },
                  { label: "GitHub", href: "https://github.com/BluntEXE/ffxiv-venue-manager" },
                  { label: "Partake.gg", href: "https://partake.gg" },
                  { label: "Ko-fi", href: "https://ko-fi.com/ehnocure" },
                ].map(({ label, href }) => (
                  <a
                    key={href}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-muted-foreground hover:text-[var(--xiv-blue)] transition-colors"
                  >
                    {label}
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Footer bottom */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-[var(--blue-008)]">
            <p className="text-[0.72rem] text-[var(--fg-faint)] leading-relaxed text-center sm:text-left max-w-[52ch]">
              &copy; {new Date().getFullYear()} XIV Venue Manager. A community fan tool, not affiliated with SQUARE ENIX
              CO., LTD. FINAL FANTASY is a registered trademark of Square Enix Holdings Co., Ltd.
            </p>
            <div className="flex items-center gap-5">
              <a
                href="https://frogge.tech/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[0.72rem] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Image src="/frogge-icon.png" alt="" width={16} height={16} className="rounded-sm" />
                Powered by Frogge
              </a>
              {/* Social icons */}
              <div className="flex items-center gap-2">
                  {[
                  {
                    href: "https://discord.gg/AN5VDNSe2A",
                    label: "Discord",
                    path: "M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.3.5c1.7.4 3 1 4.2 1.8a16.5 16.5 0 0 0-14.6 0C6 4.5 7.3 3.9 9 3.5L8.6 3a19.8 19.8 0 0 0-4.9 1.4C1 8.9.2 13.3.6 17.6a19.9 19.9 0 0 0 6 3l.8-1.3c-.7-.3-1.4-.6-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l.8 1.3a19.9 19.9 0 0 0 6-3c.5-5-.7-9.4-3.4-13.2ZM8.9 15c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.2 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z",
                  },
                  {
                    href: "https://github.com/BluntEXE/ffxiv-venue-manager",
                    label: "GitHub",
                    path: "M12 2A10 10 0 0 0 8.8 21.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2Z",
                  },
                  {
                    href: "https://ko-fi.com/ehnocure",
                    label: "Ko-fi",
                    path: "M12 21s-7.5-4.6-10-9.3C.4 8.4 1.9 5 5.2 5c2 0 3.3 1.2 3.8 2.2C9.5 6.2 10.8 5 12.8 5 16.1 5 17.6 8.4 16 11.7 13.5 16.4 12 21 12 21z",
                  },
                ].map(({ href, label, path }) => (
                  <a
                    key={href}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="w-9 h-9 rounded-lg border border-[var(--blue-015)] flex items-center justify-center text-muted-foreground hover:text-[var(--xiv-blue)] hover:border-[var(--blue-035)] transition-colors"
                  >
                    <svg className="w-[17px] h-[17px] fill-current" viewBox="0 0 24 24" aria-hidden="true">
                      <path d={path} />
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
