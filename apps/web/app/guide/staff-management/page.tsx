import type { Metadata } from "next"
import Link from "next/link"
import { SiteFooter } from "@/components/site-footer"
import { Button } from "@/components/ui/button"
import { ArrowRight, UserX, Clock, Coins, ShieldAlert } from "lucide-react"

import { BackLink } from "@/components/back-link"
export const metadata: Metadata = {
  title: "Managing Staff at Your FFXIV Venue",
  description:
    "How to build a reliable staff roster at an FFXIV roleplay venue: hiring, scheduling shifts, tracking payroll, and handling the problems that come with a team.",
  alternates: { canonical: "https://xivvenuemanager.com/guide/staff-management" },
}

const PAIN_POINTS = [
  {
    icon: UserX,
    heading: "No-shows",
    body: "A staff member confirms their shift then goes offline an hour before doors. No message, no replacement.",
  },
  {
    icon: Clock,
    heading: "Shift coverage gaps",
    body: "Rosters built in Discord threads are hard to read at a glance. Gaps only become obvious when you are already short-staffed on the night.",
  },
  {
    icon: Coins,
    heading: "Tip disputes",
    body: "Staff expect a share of the night's tips. Without a record of who worked and what came in, payouts become estimates, and estimates cause friction.",
  },
  {
    icon: ShieldAlert,
    heading: "Role creep",
    body: "Someone hired as a host starts making schedule decisions. Someone else feels underused. Undefined roles create confusion owners have to manage on the fly.",
  },
]

export default function StaffManagementPage() {
  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "Managing Staff at Your FFXIV Venue",
            description:
              "How to build a reliable staff roster at an FFXIV roleplay venue: hiring, scheduling shifts, tracking payroll, and handling the problems that come with a team.",
            url: "https://xivvenuemanager.com/guide/staff-management",
            publisher: { "@type": "Organization", name: "XIV Venue Manager", url: "https://xivvenuemanager.com" },
          }),
        }}
      />

      {/* Hero */}
      <div className="xiv-hero-bg overflow-hidden border-b border-[var(--blue-008)]">
        <div className="container mx-auto px-4 py-14 max-w-3xl">
          <BackLink href="/guide/getting-started" to="Getting started guide" className="mb-6" />
          <div className="flex items-center gap-2 mb-3">
            <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)]" />
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">
              Staff
            </span>
          </div>
          <h1 className="font-cinzel text-4xl font-bold tracking-wide xiv-glow-text mb-4">
            Managing Staff at Your FFXIV Venue
          </h1>
          <p className="text-lg text-muted-foreground">
            Running a venue solo is straightforward. Add staff and the job changes: you are now coordinating people, not
            just a schedule.
          </p>
        </div>
      </div>

      <article className="container mx-auto px-4 py-12 max-w-3xl space-y-14">
        {/* What staffing involves */}
        <section id="what-staffing-involves" className="space-y-4 scroll-mt-[84px]">
          <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
            What staffing an FFXIV venue involves
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            A venue staff team is a volunteer group. No one gets a salary, attendance is not legally required, and
            people have lives outside the game. The challenge is building enough structure that shifts get covered and
            payouts feel fair, without making it feel like a job no one applied for.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Most venues run with three to eight staff across a mix of roles: hosts who greet patrons and keep
            conversation moving, servers who handle drinks and tips, and managers who coordinate the shift. Larger
            venues add security, entertainers, and event staff on top of that core.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            The coordination layer grows faster than the roster does. Two staff on a shift is a group chat. Eight staff
            across three shifts per week is a scheduling, payroll, and communication problem. The tools that handled two
            people do not scale to eight.
          </p>
        </section>

        {/* Where it breaks down */}
        <section id="where-it-breaks-down" className="space-y-6 scroll-mt-[84px]">
          <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
            Where staff management breaks down
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Venue owners who have managed staff for more than a few months will recognise these patterns. None are
            unique to FFXIV; they show up in any volunteer-run organisation.
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

        {/* Building a roster */}
        <section id="building-a-roster" className="space-y-4 scroll-mt-[84px]">
          <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
            Building your roster
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Start with fewer staff than you think you need. Two reliable people per shift beat four unreliable ones.
            Adding staff as the venue grows is easy; replacing people who ghost after two weeks costs more time than
            hiring slowly.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Define roles before you post hiring notices. A host and a server are different jobs with different
            expectations. Write down what each role does, when they are expected on shift, and how tips get split. New
            hires who understand the structure from day one cause fewer problems than those who discover it after a
            dispute.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Hiring from your regular patron base works well. People who already like the venue are more likely to show
            up and understand how it runs. Cold hires from server recruitment channels can work, but expect a higher
            drop-off rate in the first few weeks.
          </p>
        </section>

        {/* Scheduling shifts */}
        <section id="scheduling-shifts" className="space-y-4 scroll-mt-[84px]">
          <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
            Scheduling and running shifts
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Post the schedule at least three days before the week starts. Staff who find out about a shift the morning
            of cannot adjust plans. Three days is enough lead time for most people to flag conflicts without setting the
            schedule a fortnight in advance.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Require explicit confirmations. A staff member who does not respond to a shift assignment is not confirmed.
            Treat no reply the same as a no: find cover. Chasing confirmations the night before a shift is avoidable if
            you set the expectation early that silence means unassigned.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Keep one backup for each shift who can step in if someone drops. They do not need to be on standby, just
            aware they are the backup and willing. Agree on it before the shift, not during.
          </p>
        </section>

        {/* Payroll */}
        <section id="payroll-and-tips" className="space-y-4 scroll-mt-[84px]">
          <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
            Payroll and tip splits
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Decide on a tip split policy before your first paid shift, not after your first dispute. Common approaches:
            tips go to the staff member who earned them, tips pool across the shift and split equally, or tips pool
            weighted by hours worked. Any approach works. Ambiguity and mid-run policy changes are what cause disputes.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Log tips as they happen, not from memory at the end of the night. A server who earns 50,000 gil across a
            three-hour shift in ten separate transactions will not remember the exact number an hour later. Real-time
            logging takes seconds per transaction and makes payroll accurate without anyone arguing over figures.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Pay out on a consistent schedule. Weekly works for most venues. Staff who know they will be paid every
            Sunday do not chase you on Monday morning. No defined schedule means questions you do not need.
          </p>
        </section>

        {/* How XIV VM helps */}
        <section id="how-xvm-helps" className="space-y-4 scroll-mt-[84px]">
          <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
            How XIV Venue Manager handles staff coordination
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            XIV Venue Manager gives your staff their own accounts connected to your venue. You assign shifts from the
            dashboard and staff see their schedule from their own account, without Discord threads or spreadsheets.
          </p>
          <ul className="space-y-3 text-muted-foreground">
            {[
              "Build the weekly shift schedule in the dashboard and assign staff to each slot by role.",
              "Staff see their assigned shifts and start times from their own account, with no Discord thread to dig through.",
              "Staff log tips from inside the game with a single plugin command, tied to their shift record.",
              "Payroll runs at the end of the week from shift and sales data, with no manual totalling.",
              "Patron logs show which staff served which patrons, useful for tracking performance over time.",
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
          <h2 className="font-cinzel text-xl font-semibold tracking-wide">Give your staff a proper schedule</h2>
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
