import type { Metadata } from "next"
import Link from "next/link"
import { SiteFooter } from "@/components/site-footer"
import { Button } from "@/components/ui/button"
import { ArrowRight, MapPin, Megaphone, RefreshCw, Globe } from "lucide-react"

export const metadata: Metadata = {
  title: "How to Promote Your FFXIV Venue",
  description:
    "Where FFXIV patrons find venues: directories, Partake, Discord, and in-game shouts, and how to keep your listings working without constant upkeep.",
  alternates: { canonical: "https://xivvenuemanager.com/guide/promoting" },
}

const PAIN_POINTS = [
  {
    icon: MapPin,
    heading: "Invisible listing",
    body: "You are open, but nothing outside your own Discord says so. Patrons who do not already know you exist have no way to find you.",
  },
  {
    icon: RefreshCw,
    heading: "Stale directory entries",
    body: "Your FFXIV Venues listing still shows your old schedule. Someone checks, sees Thursday night, and you have not run Thursday in months.",
  },
  {
    icon: Megaphone,
    heading: "Announcement scatter",
    body: "Discord post says one thing, Partake says another. Patrons show up on the wrong night, or not at all.",
  },
  {
    icon: Globe,
    heading: "No follow-through",
    body: "One post when you open, then silence. Patrons come back to venues they see regularly, not venues they spotted once.",
  },
]

export default function PromotingGuidePage() {
  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "How to Promote Your FFXIV Venue",
            description:
              "Where FFXIV patrons find venues: directories, Partake, Discord, and in-game shouts, and how to keep your listings working without constant upkeep.",
            url: "https://xivvenuemanager.com/guide/promoting",
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
              Promotion
            </span>
          </div>
          <h1 className="font-cinzel text-4xl font-bold tracking-wide xiv-glow-text mb-4">
            How to Promote Your FFXIV Venue
          </h1>
          <p className="text-lg text-muted-foreground">
            A full venue can run on word of mouth alone. Most do not get there. Venues that fill are listed in the right
            directories, post when they open, and keep their information current before patrons decide where to go
            tonight.
          </p>
        </div>
      </div>

      <article className="container mx-auto px-4 py-12 max-w-3xl space-y-14">
        {/* Discovery problem */}
        <section id="the-discovery-problem" className="space-y-4 scroll-mt-[84px]">
          <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
            The discovery problem
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            There are hundreds of active venues across the FFXIV community. A patron deciding where to spend their
            evening has no in-game venue browser, no official list, no notification system. They check the places they
            already know, ask in their FC chat, or search community spaces.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            If your venue is not in those places with accurate information, patrons looking for somewhere to go tonight
            have no way to find you. FFXIV promotion is about being findable when someone is already looking.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Being listed in the community directories, posting on Partake when you have events, and keeping your open
            status current are the three actions that bring in patrons you have not met yet.
          </p>
        </section>

        {/* Where it breaks down */}
        <section id="where-it-breaks-down" className="space-y-6 scroll-mt-[84px]">
          <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
            Where venue promotion breaks down
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            The most common failure is outdated information. A patron checks your listing, sees your hours, shows up,
            and the venue is dark. They do not come back.
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

        {/* FFXIV Venues */}
        <section id="ffxiv-venues-directory" className="space-y-4 scroll-mt-[84px]">
          <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
            FFXIV Venues: the community directory
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            <a
              href="https://ffxivvenues.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--xiv-blue)] hover:underline"
            >
              FFXIV Venues
            </a>{" "}
            is the main community-run directory for player venues. Patrons searching for a bar, lounge, or roleplay
            space on a specific world start here. If your venue is not listed, you are missing the most consistent
            passive discovery channel the community has.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            List your venue with complete information: world, ward, plot, a short description, and your schedule.
            Patrons skip incomplete listings. A patron who cannot tell at a glance when you are open and where you are
            moves to the next result.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Keep the listing current. When your schedule changes, update the directory. A stale listing that sends
            someone to a closed venue costs you more than no listing at all.
          </p>
        </section>

        {/* Partake */}
        <section id="partake" className="space-y-4 scroll-mt-[84px]">
          <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
            Partake: event listings and discovery
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            <a
              href="https://partake.gg"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--xiv-blue)] hover:underline"
            >
              Partake.gg
            </a>{" "}
            is where the FFXIV community browses upcoming events. If you are running a theme night, competition,
            anniversary, or anything with a fixed date and concept, it belongs on Partake. Patrons who never open their
            usual Discord servers check Partake when they want something to do.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Post far enough in advance to appear in searches before the date. For a patron who has never heard of your
            venue, the event title and description carry the entire pitch.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Events belong on Partake. Regular opens do not need listings there. A themed night with a Partake listing
            and a Discord announcement will pull more patrons than the same event with only a Discord post, because it
            reaches people outside your existing audience.
          </p>
        </section>

        {/* Discord */}
        <section id="discord" className="space-y-4 scroll-mt-[84px]">
          <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
            Discord: where your regulars live
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Your venue Discord is where regulars stay connected between visits. Keep an announcements channel with open
            night posts and event notices. Patrons who care about your venue will have notifications on for that
            channel. Do not make them search through general chat to find out when you are open next.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Beyond your own server, community Discord servers for your data centre often have venue-advertisement or
            event channels. Post there when you have events. These channels reach patrons outside your existing
            community who are already looking for somewhere to go.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Keep posts short. Venue ad channels move fast. A clean post with your venue name, date, time in Server Time,
            and world/ward beats a wall of text that patrons scroll past.
          </p>
        </section>

        {/* In-game shouts */}
        <section id="in-game-shouts" className="space-y-4 scroll-mt-[84px]">
          <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
            In-game shouts: immediate reach
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Shout chat reaches everyone in your current zone. Used in residential areas and populated hubs, a shout
            pulls in patrons who are already logged in and looking for something to do. You are open right now, here is
            where you are.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Keep shouts brief. Venue name, type, ward and plot, and a reason to come tonight. A generic &quot;we are open,
            come visit&quot; loses to a shout that gives patrons a specific reason to show up.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Shout on your home world and, when you have reason to travel, from the aetheryte plaza or residential hubs
            on other worlds in your data centre. Cross-world foot traffic is real. Some of your best regulars will be
            from other worlds who found you from a shout on a random evening.
          </p>
        </section>

        {/* Consistency */}
        <section id="consistency" className="space-y-4 scroll-mt-[84px]">
          <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
            Consistency beats volume
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            A venue that posts in three places every time it opens, for months, builds a following. One promotion
            campaign followed by silence does not. Patrons come back to venues they see regularly, not venues they
            spotted once.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Your open status needs to be accurate when you are open, your directory listing needs to match your current
            schedule, and your Discord needs a post when doors go up. None of these tasks is large on its own. Together,
            without a system, they slip.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Venues with reliable foot traffic are the ones patrons can count on: same nights, same hours, and a listing
            that confirms it before they make the trip.
          </p>
        </section>

        {/* How XIV VM helps */}
        <section id="how-xvm-helps" className="space-y-4 scroll-mt-[84px]">
          <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
            How XIV Venue Manager keeps your listings accurate
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Writing the initial listings is easy. Keeping them current when your schedule changes is the part that
            slips. XIV Venue Manager handles the accuracy side so you are not updating three places every time your
            hours shift.
          </p>
          <ul className="space-y-3 text-muted-foreground">
            {[
              "Your venue profile on xivvenuemanager.com stays live and searchable, showing your current schedule, staff, and open status to anyone browsing.",
              "Your profile shows Open while an event is live or inside your opening hours, so it matches what you actually run.",
              "Partake events sync into XIV Venue Manager automatically. Post on Partake and your dashboard stays current without a second entry.",
              "Patron visit logs track how many people came through on a given night, so you can see which nights perform and which promotions moved attendance.",
              "When you close for a hiatus or change your schedule, one update in the dashboard keeps every surface that references your listing accurate.",
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
          <h2 className="font-cinzel text-xl font-semibold tracking-wide">Get your venue listed and stay accurate</h2>
          <p className="text-[0.9rem] text-muted-foreground max-w-sm mx-auto leading-relaxed">
            Free to use. Register your venue and get the Dalamud plugin running in about five minutes.
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
