import type { Metadata } from "next"
import Link from "next/link"
import { SiteFooter } from "@/components/site-footer"
import { Button } from "@/components/ui/button"
import { ArrowRight, Users, Calendar, BarChart2, Zap } from "lucide-react"

export const metadata: Metadata = {
  title: "How to Run a Venue in FFXIV",
  description:
    "What running an FFXIV roleplay venue involves, where it gets complicated, and how XIV Venue Manager keeps you organised.",
  alternates: { canonical: "https://xivvenuemanager.com/guide/getting-started" },
}

const PAIN_POINTS = [
  {
    icon: Users,
    heading: "Staff coordination",
    body: "Tracking who is working, when, and what role they fill across multiple shifts, all in a Discord DM thread.",
  },
  {
    icon: Calendar,
    heading: "Event scheduling",
    body: "Announcing events, keeping dates consistent across Partake, Discord, and in-game, and cancelling when plans change.",
  },
  {
    icon: BarChart2,
    heading: "Revenue tracking",
    body: "Knowing how much the venue made on a given night, who sold what, and paying out staff at the end of the week.",
  },
  {
    icon: Zap,
    heading: "Going live",
    body: "Letting patrons know you are open now, without posting in four places every time you open.",
  },
]

export default function GettingStartedPage() {
  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "How to Run a Venue in FFXIV",
            description:
              "What running an FFXIV roleplay venue involves, where it gets complicated, and how XIV Venue Manager keeps you organised.",
            url: "https://xivvenuemanager.com/guide/getting-started",
            publisher: { "@type": "Organization", name: "XIV Venue Manager", url: "https://xivvenuemanager.com" },
          }),
        }}
      />

      {/* Hero */}
      <div className="xiv-hero-bg overflow-hidden border-b border-[var(--blue-008)]">
        <div className="container mx-auto px-4 py-14 max-w-3xl">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[var(--xiv-blue)] transition-colors mb-6"
          >
            &#8592; Back to Home
          </Link>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)]" />
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">
              Getting Started
            </span>
          </div>
          <h1 className="font-cinzel text-4xl font-bold tracking-wide xiv-glow-text mb-4">
            How to Run a Venue in FFXIV
          </h1>
          <p className="text-lg text-muted-foreground">
            What venue management involves, where it gets complicated, and how to stay organised when you have staff
            depending on you.
          </p>
        </div>
      </div>

      <article className="container mx-auto px-4 py-12 max-w-3xl space-y-14">
        {/* What is a venue */}
        <section id="what-is-a-venue" className="space-y-4 scroll-mt-[84px]">
          <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
            What is an FFXIV roleplay venue?
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            A venue in Final Fantasy XIV is a player-run establishment hosted inside a private estate, Free Company
            house, or apartment. Bars, clubs, lounges, inns, shops: any roleplay space with regular open hours and a
            staff team counts. Venues open on a schedule, hire staff, run events, and serve as social hubs for the RP
            community on their world.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Each venue is tied to a specific world and data centre. Your patron reach is shaped by which data centre you
            sit on (Chaos, Light, Crystal, Aether), because players can only visit venues on worlds within their own
            data centre without transferring.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Venues are player-organised. There is no in-game tool for scheduling shifts, tracking sales, or telling
            patrons you are open. Most owners start with Discord and a spreadsheet. That works until it does not.
          </p>
        </section>

        {/* What running one involves */}
        <section id="what-it-involves" className="space-y-6 scroll-mt-[84px]">
          <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
            What running a venue involves
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            You will spend more time on the operational side than you expect. Decorating and hosting are
            straightforward. Coordinating staff, scheduling events, and tracking revenue across multiple open nights is
            where new owners lose hours.
          </p>
          <div className="grid sm:grid-cols-2 gap-[18px]">
            {PAIN_POINTS.map(({ icon: Icon, heading, body }) => (
              <div key={heading} className="xiv-card rounded-xl p-6">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 bg-[var(--blue-010)] border border-[var(--blue-018)] text-[var(--xiv-blue)]">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-[0.95rem] mb-2">{heading}</h3>
                <p className="text-[0.88rem] text-muted-foreground leading-[1.55]">{body}</p>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground leading-relaxed">
            Small venues manage with a spreadsheet and a couple of Discord channels. Add five or more staff, a regular
            event schedule, and patrons who expect consistency, and the spreadsheet stops working.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            The coordination layer is what grows fastest: who is rostered when, what happened to last week&apos;s tips,
            whether the Partake listing matches the actual schedule.
          </p>
        </section>

        {/* How XIV Venue Manager helps */}
        <section id="how-xvm-helps" className="space-y-4 scroll-mt-[84px]">
          <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
            How XIV Venue Manager helps
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            XIV Venue Manager is a free tool for FFXIV venue owners and their staff. A web dashboard connects to a
            Dalamud plugin so you can manage your venue from the browser or from inside the game.
          </p>
          <ul className="space-y-3 text-muted-foreground">
            {[
              "Schedule shifts and see who is working at a glance, no more digging through Discord threads.",
              "Log sales from inside the game with a single plugin command.",
              "Run payroll at the end of the week based on shift hours and sales.",
              "Show as open automatically: your venue profile shows Open while an event is running or inside your opening hours.",
              "Track events, attendance, and revenue over time from the analytics dashboard.",
            ].map((item) => (
              <li key={item} className="flex gap-3">
                <span className="mt-1.5 w-[5px] h-[5px] bg-[var(--xiv-blue)] rotate-45 shrink-0 shadow-[0_0_6px_rgba(0,180,255,0.5)]" />
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Who it's for */}
        <section id="who-its-for" className="space-y-4 scroll-mt-[84px]">
          <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
            Who is it for?
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            XIV Venue Manager fits where you are. Opening your first venue, you can start organised without building
            your own system. Running for a year on spreadsheets, you can migrate your data and give your staff a proper
            schedule.
          </p>
          <div className="grid sm:grid-cols-2 gap-[18px]">
            <div className="xiv-card rounded-xl p-6">
              <p className="font-semibold text-[0.95rem] mb-2">New venue owners</p>
              <p className="text-[0.88rem] text-muted-foreground leading-[1.55]">
                Set up your venue, add your first staff members, and start tracking from opening night.
              </p>
            </div>
            <div className="xiv-card rounded-xl p-6">
              <p className="font-semibold text-[0.95rem] mb-2">Established venues</p>
              <p className="text-[0.88rem] text-muted-foreground leading-[1.55]">
                Move off spreadsheets, get visibility into your revenue, and give your staff a proper schedule.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-xl border border-[rgba(0,180,255,0.2)] bg-[rgba(0,180,255,0.04)] p-8 space-y-4 text-center">
          <h2 className="font-cinzel text-xl font-semibold tracking-wide">Register your venue</h2>
          <p className="text-[0.9rem] text-muted-foreground max-w-sm mx-auto leading-relaxed">
            Free to use. Setup takes about five minutes and the Dalamud plugin installs in one click.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-1">
            <Button asChild className="xiv-btn-shimmer xiv-cta font-semibold group">
              <Link href="/venues/new">
                Register your venue
                <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-[var(--xiv-blue-border)] hover:bg-[var(--xiv-blue-dim)] hover:border-[var(--xiv-blue)]"
            >
              <Link href="/guide/events">Running events guide</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-[var(--xiv-blue-border)] hover:bg-[var(--xiv-blue-dim)] hover:border-[var(--xiv-blue)]"
            >
              <Link href="/discover">Browse venues</Link>
            </Button>
          </div>
        </section>
      </article>

      <SiteFooter />
    </div>
  )
}
