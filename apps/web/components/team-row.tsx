import type { PublicTeamMember } from "@/lib/api/xvm-api"
import { initials } from "@/lib/team-groups"
import { clampFrame, photoImageStyle } from "@/lib/team-photo"

type Card = Pick<PublicTeamMember, "name" | "roles" | "bio" | "photo_url" | "photo_x" | "photo_y" | "photo_zoom">

export function TeamRow({ member }: { member: Card }) {
  return (
    <article className="flex flex-col gap-4 rounded-xl border border-[var(--blue-018)] bg-card p-4 shadow-[var(--glow-card-inset)] sm:w-fit sm:min-w-[22rem] sm:max-w-full sm:flex-row sm:items-center sm:gap-6 sm:p-5">
      {member.photo_url ? (
        <div className="relative h-[120px] w-[120px] flex-none overflow-hidden rounded-[10px] sm:self-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={member.photo_url}
            alt={member.name}
            style={photoImageStyle(clampFrame({ x: member.photo_x, y: member.photo_y, zoom: member.photo_zoom }))}
          />
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="flex h-[120px] w-[120px] flex-none items-center justify-center rounded-[10px] sm:self-start bg-gradient-to-br from-[#0a3a5c] to-[#00b4ff44] font-heading text-4xl font-semibold text-[var(--xiv-blue)]"
        >
          {initials(member.name)}
        </div>
      )}
      <div className="min-w-0">
        <h3 className="font-heading text-lg font-semibold text-foreground">{member.name}</h3>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {member.roles.map((role, index) => (
            <span
              key={`${role}-${index}`}
              className="rounded-full border border-[var(--blue-018)] bg-[var(--blue-010)] px-2.5 py-0.5 text-xs text-[var(--xiv-blue)]"
            >
              {role}
            </span>
          ))}
        </div>
        {member.bio && (
          <p className="mt-3 whitespace-pre-line text-[0.95rem] leading-relaxed text-[var(--fg-subtle)]">{member.bio}</p>
        )}
      </div>
    </article>
  )
}
