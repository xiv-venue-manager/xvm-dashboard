import type { Metadata } from "next"
import { getPublicTeam } from "@/lib/api/xvm-api"
import { groupTeam } from "@/lib/team-groups"
import { TeamRow } from "@/components/team-row"
import { TeamEditLink } from "@/components/team-edit-link"

export const revalidate = 60

export const metadata: Metadata = {
  title: "Meet the team",
  description: "The people who build and run XIV Venue Manager.",
}

export default async function TeamPage() {
  const team = await getPublicTeam().catch(() => null)

  if (!team) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="page-h1 mb-3">Team unavailable</h1>
          <p className="text-muted-foreground">Try again in a moment.</p>
        </div>
      </div>
    )
  }

  const sections = groupTeam(team.members)

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[860px] px-4 pb-20 pt-[120px] sm:px-6">
        <header className="mb-10">
          <h1 className="font-cinzel text-3xl font-bold tracking-wide">Meet the team</h1>
          <p className="mt-2 text-muted-foreground">The people who build and run XIV Venue Manager.</p>
          <div className="mt-4">
            <TeamEditLink />
          </div>
        </header>

        {sections.length === 0 ? (
          <p className="text-muted-foreground">The team page is being set up. Check back soon.</p>
        ) : (
          <div className="space-y-10">
            {sections.map((section) => (
              <section key={section.label ?? "ungrouped"}>
                {section.label && (
                  <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">
                    {section.label}
                  </h2>
                )}
                <div className="space-y-3">
                  {section.members.map((member, index) => (
                    <TeamRow key={`${member.name}-${index}`} member={member} flip={index % 2 === 1} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
