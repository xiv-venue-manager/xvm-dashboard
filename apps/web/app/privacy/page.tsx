import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What data XIV Venue Manager collects, how it is used, and how to delete it.",
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-[760px] mx-auto px-6 py-16">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[var(--xiv-blue)] transition-colors mb-8"
        >
          ← Back to home
        </Link>

        <h1 className="font-cinzel text-3xl font-bold tracking-wide mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: June 2026</p>

        <div className="space-y-8 text-[0.95rem] leading-[1.7] text-[var(--fg-subtle)]">
          <section className="space-y-3">
            <h2 className="font-[var(--font-outfit)] font-semibold text-lg text-foreground">What this tool is</h2>
            <p>
              XIV Venue Manager is a free, community-built tool for managing roleplay venues in Final Fantasy XIV. It is
              not affiliated with SQUARE ENIX CO., LTD.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-[var(--font-outfit)] font-semibold text-lg text-foreground">What we collect</h2>
            <ul className="space-y-2 list-disc list-inside pl-2">
              <li>
                <strong>Discord account data:</strong> Your Discord user ID, username, and avatar, received when you
                sign in via Discord OAuth. We do not receive your password or email unless Discord provides it as part
                of the OAuth flow.
              </li>
              <li>
                <strong>Venue data you enter:</strong> Venue name, description, location, events, shifts, sales, and
                other information you add to the dashboard.
              </li>
              <li>
                <strong>Patron visit data:</strong> Character names and world names of players who visit your venue&apos;s
                housing plot, captured by the Dalamud plugin when it is running. Only staff with active shifts are
                excluded.
              </li>
              <li>
                <strong>Plugin credentials:</strong> When you link the Dalamud plugin, our API service records when that
                plugin credential was last used.
              </li>
              <li>
                <strong>Error reports:</strong> Application errors are sent to a self-hosted GlitchTip instance. These
                include stack traces but not personal data.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-[var(--font-outfit)] font-semibold text-lg text-foreground">How we use it</h2>
            <ul className="space-y-2 list-disc list-inside pl-2">
              <li>To provide the venue management dashboard and all its features.</li>
              <li>To show venue owners patron visit history and analytics.</li>
              <li>
                To display aggregate community statistics on the public /stats page (venue count, patron count, gil
                tracked; no individual data).
              </li>
              <li>
                We do not sell data. We do not share data with third parties except as required to run the service
                (Discord OAuth, self-hosted infrastructure).
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-[var(--font-outfit)] font-semibold text-lg text-foreground">Data storage</h2>
            <p>
              All data is stored on self-hosted infrastructure. No data is sent to external cloud providers beyond what
              is listed above.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-[var(--font-outfit)] font-semibold text-lg text-foreground">Your rights</h2>
            <ul className="space-y-2 list-disc list-inside pl-2">
              <li>
                <strong>Delete your account:</strong> Contact us via Discord or the Feedback button in the app. We will
                delete your user record and associated data within 30 days.
              </li>
              <li>
                <strong>Delete your venue:</strong> Owners can delete their venue and all its data from Settings →
                Danger zone → Delete venue.
              </li>
              <li>
                <strong>Data export:</strong> Sales and payroll data can be exported as CSV from the Analytics and Sales
                pages.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-[var(--font-outfit)] font-semibold text-lg text-foreground">Cookies</h2>
            <p>
              We use one first-party cookie (
              <code className="font-mono text-xs bg-[var(--blue-010)] text-[var(--xiv-blue)] px-1.5 py-0.5 rounded">
                xvm.session-token
              </code>
              ) to keep you signed in. No advertising or tracking cookies are used.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-[var(--font-outfit)] font-semibold text-lg text-foreground">Contact</h2>
            <p>
              Questions? Reach us via the <strong>Feedback</strong> button in the app or on our{" "}
              <a
                href="https://discord.gg/xivvenuemanager"
                className="text-[var(--xiv-blue)] underline underline-offset-2 hover:opacity-80"
              >
                Discord server
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
