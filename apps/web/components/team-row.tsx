import type { PublicTeamMember } from "@/lib/api/xvm-api"
import { initials } from "@/lib/team-groups"

type Card = Pick<PublicTeamMember, "name" | "role_title" | "bio" | "photo_url">

export function TeamRow({ member, flip }: { member: Card; flip: boolean }) {
  return (
    <article
      className={`flex flex-col gap-4 rounded-xl border border-[var(--blue-018)] bg-card p-4 shadow-[var(--glow-card-inset)] sm:items-center sm:gap-6 sm:p-5 ${
        flip ? "sm:flex-row-reverse" : "sm:flex-row"
      }`}
    >
      {member.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={member.photo_url}
          alt={member.name}
          width={120}
          height={120}
          className="h-[120px] w-[120px] flex-none rounded-[10px] object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-[120px] w-[120px] flex-none items-center justify-center rounded-[10px] bg-gradient-to-br from-[#0a3a5c] to-[#00b4ff44] font-heading text-4xl font-semibold text-[var(--xiv-blue)]"
        >
          {initials(member.name)}
        </div>
      )}
      <div className="min-w-0">
        <h3 className="font-heading text-lg font-semibold text-foreground">{member.name}</h3>
        <span className="mt-1.5 inline-block rounded-full border border-[var(--blue-018)] bg-[var(--blue-010)] px-2.5 py-0.5 text-xs text-[var(--xiv-blue)]">
          {member.role_title}
        </span>
        {member.bio && (
          <p className="mt-3 whitespace-pre-line text-[0.95rem] leading-relaxed text-[var(--fg-subtle)]">{member.bio}</p>
        )}
      </div>
    </article>
  )
}
