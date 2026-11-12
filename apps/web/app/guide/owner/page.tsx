import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Owner & Manager Guide",
  description:
    "Everything you need to get your FFXIV roleplay venue running — setup, plugin install, staff management, events, payroll and more.",
  alternates: { canonical: "https://xivvenuemanager.com/guide/owner" },
}

import Link from "next/link"
import { GuideTOC } from "@/components/guide-toc"
import { SiteFooter } from "@/components/site-footer"

export default function OwnerManagerGuidePage() {
  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: "Owner & Manager Guide",
            description:
              "Everything you need to get your FFXIV roleplay venue running — setup, plugin install, staff management, events, payroll and more.",
            url: "https://xivvenuemanager.com/guide/owner",
            publisher: { "@type": "Organization", name: "XIV Venue Manager", url: "https://xivvenuemanager.com" },
          }),
        }}
      />
      {/* Guide hero */}
      <div className="xiv-hero-bg overflow-hidden border-b border-[var(--blue-008)]">
        <div className="container mx-auto px-4 py-14 max-w-3xl">
          <Link
            href="/guide/getting-started"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[var(--xiv-blue)] transition-colors mb-6"
          >
            &#8592; New to venues? Start here
          </Link>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)]" />
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">
              Documentation
            </span>
          </div>
          <h1 className="font-cinzel text-4xl font-bold tracking-wide xiv-glow-text mb-3">Owner &amp; Manager Guide</h1>
          <p className="text-lg text-muted-foreground mb-6">Setup and management reference for XIV Venue Manager.</p>
          {/* Audience role switcher — matches prototype */}
          <div className="flex gap-1 bg-[rgba(7,11,20,0.6)] border border-[var(--blue-015)] rounded-full p-1 w-fit">
            <span className="text-sm font-semibold px-4 py-1.5 rounded-full bg-[var(--xiv-blue)] text-[var(--xiv-navy)]">
              Owners &amp; managers
            </span>
            <Link
              href="/guide/staff"
              className="text-sm font-semibold px-4 py-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)] transition-colors"
            >
              Staff
            </Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-5xl">
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-11 items-start">
          <GuideTOC
            items={[
              { id: "setup", label: "Initial Setup" },
              { id: "staff", label: "Managing Staff" },
              { id: "services", label: "Services" },
              { id: "events", label: "Event Management" },
              { id: "shifts", label: "Shift Scheduling" },
              { id: "sales", label: "Sales & Revenue" },
              { id: "payroll", label: "Payroll" },
              { id: "tasks", label: "Tasks" },
              { id: "auto-greeter", label: "Auto-Greeter" },
              { id: "patron-logs", label: "Patron Logs" },
              { id: "discord", label: "Discord" },
              { id: "server-time", label: "Server Time" },
              { id: "tips", label: "Tips" },
            ]}
            footerLink={{ href: "/guide/staff", label: "Staff guide" }}
          />

          <article className="space-y-8 min-w-0">
            <header className="sr-only">
              <h1>Owner &amp; Manager Guide</h1>
            </header>

            {/* Initial Setup */}
            <section id="setup" className="space-y-6 scroll-mt-[84px]">
              <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
                Initial Setup
              </h2>

              <ol className="space-y-3 pl-2 text-sm leading-relaxed">
                <li className="flex items-start gap-3">
                  <span className="font-mono text-xs bg-[rgba(0,180,255,0.15)] text-[var(--xiv-blue)] rounded-full w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <div className="space-y-2">
                    <span className="font-medium">Create Your Venue</span>
                    <ol className="list-decimal list-inside space-y-1.5 pl-2 leading-relaxed">
                      <li>
                        Sign in at{" "}
                        <a
                          href="https://xivvenuemanager.com"
                          className="text-[var(--xiv-blue)] underline underline-offset-2 hover:opacity-80"
                        >
                          xivvenuemanager.com
                        </a>{" "}
                        with Discord
                      </li>
                      <li>Click &quot;Create Venue&quot;</li>
                      <li>
                        Fill in your venue name, world and data center. Add the in-game location (district, ward, and
                        plot or apartment) and a description if you can: the plugin uses the location to recognise your
                        house
                      </li>
                    </ol>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="font-mono text-xs bg-[rgba(0,180,255,0.15)] text-[var(--xiv-blue)] rounded-full w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <div className="space-y-2">
                    <span className="font-medium">Install the Plugin</span>
                    <ol className="list-decimal list-inside space-y-1.5 pl-2 leading-relaxed">
                      <li>
                        Open Dalamud Settings (type{" "}
                        <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">
                          /xlsettings
                        </code>{" "}
                        in the game chat)
                      </li>
                      <li>
                        Go to the <span className="font-medium">Experimental</span> tab
                      </li>
                      <li>
                        Under <span className="font-medium">Custom Plugin Repositories</span>, paste this URL and click
                        the <span className="font-medium">+</span> button:
                        <br />
                        <code className="bg-muted/60 px-1.5 py-0.5 rounded text-xs font-mono select-all break-all">
                          https://raw.githubusercontent.com/BluntEXE/XIVVenueManagerSync/master/repo.json
                        </code>
                      </li>
                      <li>
                        Click <span className="font-medium">Save and Close</span>
                      </li>
                      <li>Open the Plugin Installer, search for &quot;XIVVenueManagerSync&quot;, and install it</li>
                      <li>
                        Open with{" "}
                        <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">
                          /xvm
                        </code>
                        , go to Settings
                      </li>
                      <li>
                        On the website, open your venue&apos;s <span className="font-medium">Settings</span>, find{" "}
                        <span className="font-medium">Dalamud Plugin</span> and choose{" "}
                        <span className="font-medium">Link the plugin</span>, then press{" "}
                        <span className="font-medium">Generate link code</span>
                      </li>
                      <li>
                        In the plugin&apos;s Settings, find <span className="font-medium">Account link</span>, type the
                        code and press Link. One link covers every venue you work at.
                      </li>
                      <li>Select your venue</li>
                    </ol>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="font-mono text-xs bg-[rgba(0,180,255,0.15)] text-[var(--xiv-blue)] rounded-full w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </span>
                  <div className="space-y-2">
                    <span className="font-medium">Add Your Character</span>
                    <p className="text-muted-foreground leading-relaxed">
                      A visit is recorded as staff when its character is linked to a member who is clocked in at that
                      moment. The plugin does not log your own visits until your current character is linked.
                    </p>
                    <ol className="list-decimal list-inside space-y-1.5 pl-2 leading-relaxed">
                      <li>
                        In the plugin, open Settings and press{" "}
                        <span className="font-medium">Link current character</span> (log in to the character first). The
                        Setup checklist at the top of Settings shows when it is done
                      </li>
                      <li>
                        Or on the website, open the account menu in the top right, go to{" "}
                        <span className="font-medium">Profile</span>, and add your FFXIV character name and world under{" "}
                        <span className="font-medium">My Characters</span>
                      </li>
                      <li>Ask your staff to do the same from their own accounts</li>
                    </ol>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="font-mono text-xs bg-[rgba(0,180,255,0.15)] text-[var(--xiv-blue)] rounded-full w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">
                    4
                  </span>
                  <div className="space-y-2">
                    <span className="font-medium">Link Your House to Your Venue</span>
                    <p className="text-muted-foreground leading-relaxed">
                      The plugin recognises your venue&apos;s house by its address. When you enter a house that matches
                      exactly one of your venues, the plugin saves it and links it to that venue by itself. Houses you
                      saved earlier are linked the same way, and each staff member&apos;s plugin does this on its own.
                    </p>
                    <ol className="list-decimal list-inside space-y-1.5 pl-2 leading-relaxed">
                      <li>
                        In your venue&apos;s <span className="font-medium">Settings</span>, set the in-game location:{" "}
                        <span className="font-medium">House</span> (district, ward and plot) or{" "}
                        <span className="font-medium">Apartment</span>
                      </li>
                      <li>Enter the house in game with the plugin running</li>
                    </ol>
                    <p className="text-muted-foreground leading-relaxed">
                      If it does not link (the address is missing or wrong, or two venues share it), link it by hand: go
                      to the house, open the plugin (
                      <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">
                        /xvm
                      </code>
                      ), go to the <span className="font-medium">Venues</span> tab, enter a name and click{" "}
                      <span className="font-medium">Save Venue</span>, then choose your venue in the{" "}
                      <span className="font-medium">XIV-App Venue</span> column.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="font-mono text-xs bg-[rgba(0,180,255,0.15)] text-[var(--xiv-blue)] rounded-full w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">
                    5
                  </span>
                  <div className="space-y-2">
                    <span className="font-medium">Configure Venue Settings</span>
                    <p className="text-muted-foreground leading-relaxed">In venue Settings:</p>
                    <ul className="space-y-3 pl-2 leading-relaxed">
                      <li className="space-y-1.5">
                        <span className="font-medium">Visibility Controls</span>: Control what staff can see:
                        <ul className="list-disc list-inside pl-4 space-y-1 mt-1.5 text-muted-foreground">
                          <li>
                            <span className="font-medium text-foreground">Tasks</span>: All tasks, Assigned only, or
                            Assigned + unassigned
                          </li>
                          <li>
                            <span className="font-medium text-foreground">Sales</span>: All transactions, Their own
                            only, or No access
                          </li>
                          <li>
                            <span className="font-medium text-foreground">Revenue</span>: All statistics, Personal only,
                            or Hidden. Controls revenue numbers in Analytics and Live Mode
                          </li>
                          <li>
                            <span className="font-medium text-foreground">Events</span>: All (including drafts), or
                            Published only
                          </li>
                        </ul>
                      </li>
                      <li>
                        <span className="font-medium">Discord</span>: Connect your server and choose the honeypot,
                        events and rooms channels (see Discord below)
                      </li>
                    </ul>
                  </div>
                </li>
              </ol>
            </section>

            {/* Managing Staff */}
            <section id="staff" className="space-y-6 scroll-mt-[84px]">
              <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
                Managing Staff
              </h2>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-foreground/80">Inviting Staff</h3>
                <p className="text-sm leading-relaxed">
                  Go to Staff &gt; Invite, create an invite link, and share it. Staff sign in with Discord.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-foreground/80">Roles</h3>
                <ul className="space-y-2 pl-2 text-sm leading-relaxed">
                  <li>
                    <span className="font-medium">Owner</span>: Full access to everything
                  </li>
                  <li>
                    <span className="font-medium">Manager</span>: Can manage events, tasks, shifts, services, staff, and
                    view analytics
                  </li>
                  <li>
                    <span className="font-medium">Staff</span>: Can log sales, view their shifts, see events. Visibility
                    depends on settings.
                  </li>
                </ul>
              </div>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-foreground/80">Custom Roles</h3>
                <p className="text-sm leading-relaxed">
                  Create custom roles like Bartender, DJ, Greeter under Staff &gt; Roles. Assign them to services so
                  staff only see relevant offerings in the plugin.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-foreground/80">Temporary Roles (Deputize)</h3>
                <p className="text-sm leading-relaxed">
                  Grant someone a higher role for a set time, useful when you need cover.
                </p>
                <ul className="space-y-2 pl-2 text-sm leading-relaxed list-disc list-inside">
                  <li>
                    On the Staff page, open a member&apos;s card and click{" "}
                    <span className="font-medium">Manage Role</span>
                  </li>
                  <li>
                    Set a <span className="font-medium">Temporary Role</span> (e.g. Manager) and pick an expiry
                  </li>
                  <li>They get the elevated role immediately and revert to their permanent role when it expires</li>
                  <li>
                    Cards show a <span className="font-medium text-yellow-400">Temporary</span> badge while active; the
                    badge turns warning-colored in the last 24h
                  </li>
                </ul>
                <p className="text-sm leading-relaxed text-muted-foreground">Their permanent role stays in place.</p>
              </div>
            </section>

            {/* Services */}
            <section id="services" className="space-y-6 scroll-mt-[84px]">
              <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
                Services
              </h2>

              <p className="text-sm leading-relaxed">
                Services are the offerings your staff sell: drinks, dances, lap dances. They appear as selectable items
                when staff log a sale in the plugin or on the website.
              </p>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-foreground/80">Creating Services</h3>
                <ol className="list-decimal list-inside space-y-1.5 pl-2 text-sm leading-relaxed">
                  <li>Go to Services and click &quot;Add Service&quot;</li>
                  <li>Set a name, optional description, and default price</li>
                  <li>
                    Assign to custom roles (optional). Staff only see services linked to their roles, keeping the plugin
                    list clean.
                  </li>
                  <li>Toggle active/inactive to hide services without deleting them</li>
                </ol>
              </div>
            </section>

            {/* Event Management */}
            <section id="events" className="space-y-6 scroll-mt-[84px]">
              <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
                Event Management
              </h2>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-foreground/80">Creating Events</h3>
                <p className="text-sm leading-relaxed">
                  Go to Events &gt; Create. Set title, type (Performance, Game Night, Social, etc.), start/end time, and
                  description. Draft events are hidden from staff. Published events appear on the events list, then
                  switch to Active while the event is running and Completed when it ends.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-foreground/80">Recurring Events</h3>
                <p className="text-sm leading-relaxed">
                  Turn on <span className="font-medium">Repeating Event</span> and choose Weekly, Every two weeks, or
                  Monthly. Future occurrences join the schedule automatically; each one has its own event page, status,
                  and roster.
                </p>
                <p className="text-sm leading-relaxed">
                  To end the series, open any occurrence and choose <span className="font-medium">Cancel Series</span>.
                  That cancels all future occurrences; past and active events are left alone.
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  For a venue synced with Partake.gg, only use a repeating event for a series Partake does not manage.
                  If both cover the same night, duplicate events appear.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-foreground/80">Event Rosters</h3>
                <p className="text-sm leading-relaxed">
                  Open an event and use the Roster card to add the positions working that event. Add a shift to each
                  position with its start time, end time, and number of seats. Managers can assign staff directly, or
                  staff can claim an open seat from the event page. If your venue requires approval, the claim waits
                  there until a manager approves or rejects it.
                </p>
                <p className="text-sm leading-relaxed">
                  On an event in a series, choose <span className="font-medium">Apply to future occurrences</span> to
                  copy the positions and shifts to later occurrences that have no roster. Seats, people, cancelled
                  shifts, and archived positions are not copied, so each occurrence starts with its seats open.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-foreground/80">Event Templates</h3>
                <p className="text-sm leading-relaxed">
                  Templates save the title, type, description, and default times so you can prefill a new event. They do
                  not create a series; use <span className="font-medium">Repeating Event</span> for that.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-foreground/80">Partake.gg Integration</h3>
                <p className="text-sm leading-relaxed">
                  If your venue uses{" "}
                  <a
                    href="https://partake.gg"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--xiv-blue)] underline underline-offset-2 hover:opacity-80"
                  >
                    Partake.gg
                  </a>{" "}
                  for event listings, you can automatically sync those events into XIV Venue Manager:
                </p>
                <ol className="list-decimal list-inside space-y-1.5 pl-2 text-sm leading-relaxed">
                  <li>Go to Settings for your venue</li>
                  <li>
                    In the Integrations section, find <span className="font-medium">Partake.gg Event Sync</span>
                  </li>
                  <li>
                    Enter your Partake Team ID (found in your Partake team URL, e.g.{" "}
                    <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">
                      partake.gg/team/123
                    </code>
                    )
                  </li>
                  <li>
                    Click <span className="font-medium">Save Settings</span>, then{" "}
                    <span className="font-medium">Sync Now</span> to pull events immediately
                  </li>
                </ol>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Once linked, events sync every hour. Synced events show a{" "}
                  <span className="font-medium text-[var(--xiv-blue)]">Partake</span> badge on the events list and
                  detail pages. XIV Venue Manager creates new events and updates existing ones if the title or times
                  change on Partake.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-foreground/80">Live Mode</h3>
                <p className="text-sm leading-relaxed">
                  When an event is Active, the <span className="font-medium">Live</span> page shows real-time stats:
                </p>
                <ul className="list-disc list-inside space-y-1.5 pl-4 text-sm text-muted-foreground">
                  <li>Live patron count</li>
                  <li>Running sale count and revenue total</li>
                  <li>Live activity feed (every sale and patron movement appears instantly)</li>
                  <li>Event duration timer</li>
                </ul>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Powered by Server-Sent Events. No refresh needed.
                </p>
              </div>
            </section>

            {/* Shift Scheduling */}
            <section id="shifts" className="space-y-6 scroll-mt-[84px]">
              <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
                Shift Scheduling
              </h2>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-foreground/80">Creating Shifts</h3>
                <ol className="list-decimal list-inside space-y-1.5 pl-2 text-sm leading-relaxed">
                  <li>Go to Shifts and click &quot;Schedule Shift&quot;</li>
                  <li>Select a staff member, date, start time, and end time</li>
                  <li>
                    Times are entered in your own local time — converted automatically, no need to think in Server Time
                  </li>
                </ol>
              </div>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-foreground/80">How Shifts Work</h3>
                <ul className="list-disc list-inside space-y-1.5 pl-4 text-sm leading-relaxed">
                  <li>Staff see their shifts on their dashboard and in the plugin</li>
                  <li>
                    A shift a staff member claims shows as awaiting approval until a manager approves it, and they
                    cannot clock in until then
                  </li>
                  <li>The plugin lets staff Clock In from 30 minutes before their shift starts</li>
                  <li>Clock Out calculates hours worked automatically</li>
                  <li>Statuses: Pending approval, Scheduled, Active, Completed, Missed, Cancelled</li>
                </ul>
              </div>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-foreground/80">Quick Commands</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-[rgba(0,180,255,0.05)] border border-[rgba(0,180,255,0.12)] rounded-lg p-3">
                    <code className="text-xs font-mono font-medium text-[var(--xiv-blue)]">/xvm start</code>
                    <p className="text-xs text-muted-foreground mt-1">Clock into your current shift</p>
                  </div>
                  <div className="bg-[rgba(0,180,255,0.05)] border border-[rgba(0,180,255,0.12)] rounded-lg p-3">
                    <code className="text-xs font-mono font-medium text-[var(--xiv-blue)]">/xvm end</code>
                    <p className="text-xs text-muted-foreground mt-1">Clock out of your active shift</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Sales & Revenue */}
            <section id="sales" className="space-y-6 scroll-mt-[84px]">
              <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
                Sales &amp; Revenue
              </h2>

              <p className="text-sm leading-relaxed">
                Sales come from two places: the <span className="font-medium">plugin</span> (
                <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">
                  /xvm sale
                </code>{" "}
                commands or Sales tab) and the <span className="font-medium">website</span> (Sales page). Both create
                identical records with amount, customer, service, event, and staff attribution.
              </p>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-foreground/80">Plugin Commands</h3>
                <div className="grid grid-cols-1 gap-3">
                  <div className="bg-[rgba(0,180,255,0.05)] border border-[rgba(0,180,255,0.12)] rounded-lg p-3">
                    <code className="text-xs font-mono font-medium text-[var(--xiv-blue)]">/xvm sale 500 Ehno</code>
                    <p className="text-xs text-muted-foreground mt-1">
                      Open Sales tab with amount and customer prefilled
                    </p>
                  </div>
                  <div className="bg-[rgba(0,180,255,0.05)] border border-[rgba(0,180,255,0.12)] rounded-lg p-3">
                    <code className="text-xs font-mono font-medium text-[var(--xiv-blue)]">/xvm sale! 500 Ehno</code>
                    <p className="text-xs text-muted-foreground mt-1">
                      Log sale instantly without opening UI; chat confirmation shown
                    </p>
                  </div>
                  <div className="bg-[rgba(0,180,255,0.05)] border border-[rgba(0,180,255,0.12)] rounded-lg p-3">
                    <code className="text-xs font-mono font-medium text-[var(--xiv-blue)]">/xvm target 500</code>
                    <p className="text-xs text-muted-foreground mt-1">
                      Open Sales tab with your current target as customer
                    </p>
                  </div>
                  <div className="bg-[rgba(0,180,255,0.05)] border border-[rgba(0,180,255,0.12)] rounded-lg p-3">
                    <code className="text-xs font-mono font-medium text-[var(--xiv-blue)]">/xvm target! 500</code>
                    <p className="text-xs text-muted-foreground mt-1">
                      Log sale instantly for your current target; no UI needed
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-foreground/80">Timeline</h3>
                <p className="text-sm leading-relaxed">
                  The Timeline merges all sales and patron activity into a single feed with real-time updates. Filter by
                  Sales or Patrons. New entries appear at the top without refreshing.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-foreground/80">Analytics</h3>
                <p className="text-sm leading-relaxed">
                  The Analytics page shows revenue over time, average transactions, top services, patron trends, and
                  per-event performance with profit margins.
                </p>
              </div>
            </section>

            {/* Payroll */}
            <section id="payroll" className="space-y-6 scroll-mt-[84px]">
              <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
                Payroll
              </h2>

              <p className="text-sm leading-relaxed">
                The Payroll page calculates staff compensation based on completed shift hours. Managers and Owners see a
                breakdown of each staff member&apos;s hours worked and recommended payment amounts rounded to the
                nearest whole number.
              </p>

              <ul className="list-disc list-inside space-y-1.5 pl-4 text-sm leading-relaxed">
                <li>Set an hourly rate for your venue</li>
                <li>View total hours worked per staff member</li>
                <li>See calculated payment amounts based on shift records</li>
                <li>Add manual payroll entries with notes</li>
              </ul>
            </section>

            {/* Tasks */}
            <section id="tasks" className="space-y-6 scroll-mt-[84px]">
              <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
                Tasks
              </h2>

              <p className="text-sm leading-relaxed">
                Tasks let you assign and track to-dos for your team: event prep, follow-ups, recurring duties.
              </p>

              <ul className="list-disc list-inside space-y-1.5 pl-4 text-sm leading-relaxed">
                <li>Create tasks from the Tasks page; optionally assign to a staff member and set a due date</li>
                <li>Staff can view and complete their assigned tasks</li>
                <li>
                  <span className="font-medium">Task Visibility</span> (in Settings):{" "}
                  <span className="font-medium">All</span> shows every task to all staff;{" "}
                  <span className="font-medium">Assigned only</span> shows staff only the tasks assigned to them;{" "}
                  <span className="font-medium">Assigned + unassigned</span> shows their tasks plus tasks with no
                  assignee
                </li>
              </ul>
            </section>

            {/* Auto-Greeter */}
            <section id="auto-greeter" className="space-y-6 scroll-mt-[84px]">
              <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
                Auto-Greeter
              </h2>

              <p className="text-sm leading-relaxed">
                The plugin can automatically send a{" "}
                <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">
                  /tell
                </code>{" "}
                to patrons when they enter your venue&apos;s housing plot.
              </p>

              <ul className="list-disc list-inside space-y-1.5 pl-4 text-sm leading-relaxed">
                <li>
                  Enable and configure the message in plugin <span className="font-medium">Settings</span>
                </li>
                <li>Only fires for patrons. Staff on active shifts are not greeted.</li>
                <li>Works alongside patron tracking; the plugin must be running</li>
              </ul>
            </section>

            {/* Patron Logs */}
            <section id="patron-logs" className="space-y-6 scroll-mt-[84px]">
              <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
                Patron Logs
              </h2>

              <p className="text-sm leading-relaxed">
                The Patron Logs page (Owners and Managers only) gives you a full historical view of every patron visit.
                Filter by:
              </p>
              <ul className="list-disc list-inside space-y-1.5 pl-4 text-sm text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">Event</span>: see all visits for a specific event
                </li>
                <li>
                  <span className="font-medium text-foreground">Date range</span>: defaults to the last 7 days
                </li>
                <li>
                  <span className="font-medium text-foreground">Character name</span>: look up a specific visitor
                </li>
                <li>
                  <span className="font-medium text-foreground">Classification</span>: patron, staff, or all (a visit
                  counts as staff when its character is linked to a member who is clocked in at that moment)
                </li>
              </ul>
            </section>

            {/* Discord */}
            <section id="discord" className="space-y-6 scroll-mt-[84px]">
              <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
                Discord
              </h2>

              <p className="text-sm leading-relaxed">
                The XIV Venue Manager bot does the posting to your Discord server, so there are no webhook URLs to set
                up. In venue Settings:
              </p>
              <ul className="list-disc list-inside space-y-1.5 pl-4 text-sm leading-relaxed">
                <li>
                  <span className="font-medium">Connected server</span>: which Discord server this venue belongs to.
                  Only the venue owner can change it.
                </li>
                <li>
                  <span className="font-medium">Honeypot channel</span>: anyone without server powers who posts here is
                  banned. The bot needs Ban Members and Manage Messages in your server, and the trap does nothing until
                  a channel is set.
                </li>
                <li>
                  <span className="font-medium">Events channel</span>: where the bot posts a published event.
                </li>
                <li>
                  <span className="font-medium">Rooms channel</span>: where the bot posts rooms. Nothing posts until a
                  channel is set.
                </li>
              </ul>
            </section>

            {/* Server Time */}
            <section id="server-time" className="space-y-6 scroll-mt-[84px]">
              <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
                Server Time (ST)
              </h2>

              <p className="text-sm leading-relaxed">
                Shift and event scheduling is entered and shown in your own local time — the dashboard converts it
                automatically, so a time set by someone in a different timezone still lines up correctly for everyone.
                Opening hours and Discord posts still use <span className="font-medium">Server Time (ST)</span> — always
                UTC, regardless of your data center — since those are shared references rather than something one person
                schedules.
              </p>
              <p className="text-sm leading-relaxed">
                Your dashboard is different: notifications, staff join dates, analytics, and other things you view are
                shown in your own local time automatically, based on your device&apos;s clock.
              </p>
            </section>

            {/* Tips */}
            <section id="tips" className="space-y-6 scroll-mt-[84px]">
              <h2 className="font-cinzel text-2xl font-semibold border-b border-[rgba(0,180,255,0.2)] pb-3 tracking-wide">
                Tips
              </h2>

              <ul className="space-y-2.5 pl-2 text-sm leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5">&#10003;</span>
                  <span>
                    Use <span className="font-medium">Live Mode</span> during events to watch patron flow and revenue.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5">&#10003;</span>
                  <span>Connect your Discord server early so the bot can post your events</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5">&#10003;</span>
                  <span>
                    Use <span className="font-medium">Repeating Event</span> for series, and{" "}
                    <span className="font-medium">Event Templates</span> to prefill the details
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5">&#10003;</span>
                  <span>
                    Review <span className="font-medium">Analytics</span> weekly to spot trends
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5">&#10003;</span>
                  <span>
                    Set{" "}
                    <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">
                      salesVisibility
                    </code>{" "}
                    to{" "}
                    <code className="bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded text-xs font-mono">
                      own
                    </code>{" "}
                    if you want staff to only see their own performance
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5">&#10003;</span>
                  <span>
                    Link your <span className="font-medium">Partake.gg</span> team in Settings to import events without
                    creating them manually.
                  </span>
                </li>
              </ul>
            </section>
          </article>
        </div>
      </div>
      <SiteFooter />
    </div>
  )
}
