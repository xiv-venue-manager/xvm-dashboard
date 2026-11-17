import type { Metadata } from "next"

import { BackLink } from "@/components/back-link"
export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Terms of use for XIV Venue Manager.",
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-[760px] mx-auto px-6 py-16">
        <BackLink href="/" to="Home" className="mb-8" />

        <h1 className="font-cinzel text-3xl font-bold tracking-wide mb-2">Terms of Use</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: June 2026</p>

        <div className="space-y-8 text-[0.95rem] leading-[1.7] text-[var(--fg-subtle)]">
          <section className="space-y-3">
            <h2 className="font-[var(--font-outfit)] font-semibold text-lg text-foreground">About this service</h2>
            <p>
              XIV Venue Manager is a free community tool for managing roleplay venues in Final Fantasy XIV. It is
              provided as-is, without warranty. It is not affiliated with SQUARE ENIX CO., LTD. FINAL FANTASY is a
              registered trademark of Square Enix Holdings Co., Ltd.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-[var(--font-outfit)] font-semibold text-lg text-foreground">Use of the service</h2>
            <ul className="space-y-2 list-disc list-inside pl-2">
              <li>You must sign in with a Discord account to use the dashboard.</li>
              <li>
                You are responsible for all content you add to your venue: names, descriptions, event details, and
                patron data.
              </li>
              <li>
                The Dalamud plugin captures character names of players who enter your venue&apos;s housing plot. By using the
                plugin, you accept responsibility for ensuring this is appropriate in the context of your venue.
              </li>
              <li>Do not use this service to harass, stalk, or harm other players.</li>
              <li>Do not attempt to access other users&apos; data or venues without authorisation.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-[var(--font-outfit)] font-semibold text-lg text-foreground">Availability</h2>
            <p>
              This is a community project maintained by volunteers. We aim for good uptime but make no guarantees. The
              service may be modified, interrupted, or discontinued at any time.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-[var(--font-outfit)] font-semibold text-lg text-foreground">Account termination</h2>
            <p>
              We reserve the right to suspend or delete accounts that violate these terms or are used to harm the
              community.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-[var(--font-outfit)] font-semibold text-lg text-foreground">Limitation of liability</h2>
            <p>
              XIV Venue Manager is provided free of charge. To the maximum extent permitted by law, the maintainers are
              not liable for any loss of data, revenue, or other damages arising from use of the service.
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
