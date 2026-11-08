import type { Metadata } from "next"
import Link from "next/link"
import { SiteFooter } from "@/components/site-footer"
import { Button } from "@/components/ui/button"
import { ArrowRight, CalendarDays, Users, Megaphone, BarChart2 } from "lucide-react"

export const metadata: Metadata = {
  title: "Running Events at Your FFXIV Venue",
  description:
    "How to plan, staff, and promote events at an FFXIV roleplay venue: from theme nights to anniversary runs, without the coordination falling apart.",
  alternates: { canonical: "https://xivvenuemanager.com/guide/events" },
}

const PAIN_POINTS = [
  {
    icon: CalendarDays,
    heading: "Announcement scatter",
    body: "Partake, Discord, in-game shouts: update one, forget another, and patrons show up on the wrong date.",
  },
  {
    icon: Users,
    heading: "Staff no-shows",
    body: "Events need more hands than a regular night. Without a proper roster, a last-minute cancellation means scrambling in the hour before doors open.",
  },
  {
    icon: Megaphone,
    heading: "Promotion timing",
    body: "Too early and people forget. Too late and they already have plans. Getting the window right is a skill most owners learn the hard way.",
  },
  {
    icon: BarChart2,
    heading: "No post-event data",
    body: "Did the theme night pull more patrons than a regular open? Did the entertainer add to revenue or just cost a tip? Hard to know without records.",
  },
]

export default function EventsGuidePage() {
  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "Running Events at Your FFXIV Venue",
            description:
              "How to plan, staff, and promote events at an FFXIV roleplay venue: from theme nights to anniversary runs, without the coordination falling apart.",
            url: "https://xivvenuemanager.com/guide/events",
            publisher: { "@type": "Organization", name: "XIV Venue Manager", url: "https://xivvenuemanager.com" },
          }),
        }}
      />

      {/* Hero */}
      <div className="xiv-hero-bg overflow-hidden border-b border-[var(--blue-008)]">
        <div className="container mx-auto px-4 py-14 max-w-3xl">
          <Link
            href="/guide/getting-started"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[var(--xiv-blue)] transition-colors mb-6"
          >
            &#8592; Getting started guide
          </Link>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)]" />
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">
              Events
            </span>
          </div>
          <h1 className="font-cinzel text-4xl font-bold tracking-wide xiv-glow-text mb-4">
            Running Events at Your FFXIV Venue
          </h1>
          <p className="text-lg text-muted-foreground">
            Theme nights, anniversary runs, hosted competitions bring in patrons who skip regular opens. They also add a
            coordination layer most venue owners underestimate.
          </p>
        </div>
      </div>

      <article className="container mx-auto px-4 py-12 max-w-3xl space-y-14">
        {/* What venue events are */}
        <section id="what-are-events" className="space-y-4 scroll-mt-[84px]">
          <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
            What makes a venue event different from a regular open?
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            A regular open night is your venue doing what it always does: doors up, staff on shift, patrons come and go.
            An event is anything built around a concept: a theme night, a DJ set, a costume competition, a venue
            anniversary, a seasonal celebration tied to a patch or real-world holiday.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Events pull in patrons who skip regular opens. A patron who has never heard of your venue will show up for a
            themed event posted in the right Discord server. A regular Tuesday open gives them no reason to.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            The trade-off is operational load. Events need more planning, more staff, and more promotion. The
            coordination manageable for a regular night gets harder when you add a guest performer, a raffle, or a
            competition with prizes.
          </p>
        </section>

        {/* Where it goes wrong */}
        <section id="where-it-goes-wrong" className="space-y-6 scroll-mt-[84px]">
          <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
            Where event coordination breaks down
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            The announcement goes out on Partake but the Discord post has a different time. A staff member confirms then
            cancels the night before. The event runs, and three weeks later you have no record of attendance or whether
            it was worth repeating.
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
        </section>

        {/* Planning */}
        <section id="planning-an-event" className="space-y-4 scroll-mt-[84px]">
          <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
            Planning: timing and announcement
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Announce five to seven days out. Earlier and patrons forget before the event arrives; later and they already
            have plans. Anniversaries and large competitions can justify two weeks, but you need follow-up posts or the
            first announcement gets buried.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Post in every channel your patrons use, with the same details in each. If your Partake listing says 9 PM ST
            and your Discord says 8 PM, someone shows up an hour early and leaves before doors open. Write the details
            once and copy them everywhere.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Post a reminder on the day of the event. Thirty minutes before doors, an in-game shout reaches anyone
            already logged in and looking for something to do.
          </p>
        </section>

        {/* Staffing */}
        <section id="staffing-events" className="space-y-4 scroll-mt-[84px]">
          <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
            Staffing: what events need that regular shifts do not
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Events need more staff than a regular open, and different roles. A normal shift runs on your usual host mix.
            A large event needs a dedicated competition host, extra staff at the door for queues, and someone
            coordinating the guest performer instead of serving patrons.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Get confirmations earlier than you expect to need them. Staff reliable on regular nights sometimes treat
            events as optional when they do not know what depends on them. Explicit shift assignments with a role
            description and a confirmation step cut last-minute gaps.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Have one backup for each critical role. If your event host cancels the afternoon of the event and no one can
            step in, you either cancel or host while managing everything else. For a small gathering that is manageable.
            For a large anniversary run, it is a bad night.
          </p>
        </section>

        {/* Tracking + repeating */}
        <section id="tracking-events" className="space-y-4 scroll-mt-[84px]">
          <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
            After the event: what to track and why
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            You cannot improve a theme night you have no data on: attendance headcount, revenue compared to a regular
            night, whether the guest performer brought anyone new.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Note the date, the format, peak patron count, and the night&apos;s revenue. After three or four events you will
            see which formats pull well on your world and whether certain days perform better.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Track revenue for payouts too. Staff working an event shift expect a share of the night&apos;s tips. Without a
            record of what came in, that calculation is a guess or a dispute.
          </p>
        </section>

        {/* How XIV VM helps */}
        <section id="how-xvm-helps" className="space-y-4 scroll-mt-[84px]">
          <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
            How XIV Venue Manager handles event coordination
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            XIV Venue Manager gives events their own scheduling layer in the same dashboard you use for regular shifts.
            Staff get assigned, see their role and start time, and confirm from the app. While an event is live, your
            venue profile shows as open and the Live page tracks patrons and sales.
          </p>
          <ul className="space-y-3 text-muted-foreground">
            {[
              "Schedule events separately from regular shifts, with roles and notes per staff member.",
              "Partake events sync into the dashboard automatically, so your XIV VM event list stays current with what you post on Partake.gg.",
              "Staff log sales from inside the game with a single plugin command, with no spreadsheet handoff at the end of the night.",
              "Revenue and attendance roll into the analytics dashboard so you can compare events side by side over time.",
              "Payroll at the end of the week pulls from shift records, so event tip payouts are calculated, not estimated.",
            ].map((item) => (
              <li key={item} className="flex gap-3">
                <span className="mt-1.5 w-[5px] h-[5px] bg-[var(--xiv-blue)] rotate-45 shrink-0 shadow-[0_0_6px_rgba(0,180,255,0.5)]" />
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* CTA */}
        <section className="rounded-xl border border-[rgba(0,180,255,0.2)] bg-[rgba(0,180,255,0.04)] p-8 space-y-4 text-center">
          <h2 className="font-cinzel text-xl font-semibold tracking-wide">
            Plan your next event with XIV Venue Manager
          </h2>
          <p className="text-[0.9rem] text-muted-foreground max-w-sm mx-auto leading-relaxed">
            Free to use. Register your venue and get the Dalamud plugin in about five minutes.
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
              <Link href="/guide/staff-management">Managing staff guide</Link>
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
