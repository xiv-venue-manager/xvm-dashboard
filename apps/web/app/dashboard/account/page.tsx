import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { myVenueRoles } from "@/lib/api/venue-access"
import { getMe } from "@/lib/api/xvm-api"
import { getValidXvmApiToken } from "@/lib/api/xvm-api-store"
import { format } from "date-fns"
import { User, Settings, Scroll, Users, Building2, ChevronRight } from "lucide-react"

export default async function ProfilePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })

  if (!user) redirect("/auth/signin")

  const token = await getValidXvmApiToken(session.user.id)
  const displayName = token ? ((await getMe(token).catch(() => null))?.person?.display_name ?? null) : null

  const roles = await myVenueRoles(session.user.id)
  const venues = await prisma.venue.findMany({
    where: { id: { in: [...roles.keys()] } },
    select: { id: true, name: true, slug: true, dataCenter: true, world: true },
    orderBy: { name: "asc" },
  })

  const initials = user.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U"

  const navItems = [
    {
      icon: Scroll,
      label: "My Characters",
      href: "/dashboard/account/characters",
      desc: "Manage your FFXIV character names",
    },
    {
      icon: Settings,
      label: "Account Settings",
      href: "/dashboard/account/settings",
      desc: "Display name, privacy and danger zone",
    },
  ]

  return (
    <div className="page-inner" style={{ maxWidth: 740 }}>
      {/* Header */}
      <div className="head-row">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-[7px] h-[7px] bg-[rgba(0,180,255,0.7)] rotate-45 shadow-[0_0_10px_rgba(0,180,255,0.5)] flex-shrink-0" />
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">
              Account
            </span>
          </div>
          <h1 className="page-h1">Profile</h1>
        </div>
      </div>

      {/* Profile card */}
      <div className="vcard flex items-start gap-6 px-7 py-6 mt-8">
        {/* Avatar */}
        <div
          className="flex-shrink-0 w-[72px] h-[72px] rounded-full grid place-items-center text-xl font-bold text-white"
          style={{ background: "linear-gradient(135deg, #5865F2, #00b4ff)" }}
        >
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt={user.name ?? ""} className="w-full h-full rounded-full object-cover" />
          ) : (
            initials
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h2 className="text-[1.35rem] font-[var(--font-outfit)] font-semibold leading-tight">
            {displayName || user.name || "User"}
          </h2>
          {user.name && displayName && user.name !== displayName && (
            <p className="text-[0.82rem] text-muted-foreground mt-0.5">{user.name}</p>
          )}
          <p className="text-[0.82rem] text-muted-foreground mt-1">{user.email}</p>
          <div className="flex items-center gap-4 mt-3 flex-wrap">
            {user.discordId && (
              <span className="inline-flex items-center gap-1.5 text-[0.74rem] font-medium text-[#5865F2] bg-[rgba(88,101,242,0.1)] border border-[rgba(88,101,242,0.25)] px-2.5 py-1 rounded-full">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.033.054a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
                </svg>
                Discord linked
              </span>
            )}
            <span className="text-[0.74rem] text-[var(--fg-faint)]">
              Member since {format(user.createdAt, "MMM yyyy")}
            </span>
          </div>
        </div>
      </div>

      {/* Venues */}
      {venues.length > 0 && (
        <div className="mt-8">
          <div className="section-label">
            <span className="sl-label">Your venues</span>
            <span className="ln" />
            <span className="count">{venues.length}</span>
          </div>
          <div className="space-y-2">
            {venues.map((venue) => (
              <Link
                key={venue.id}
                href={`/dashboard/${venue.slug}`}
                className="vcard flex items-center gap-4 px-5 py-3.5 hover:border-[var(--blue-035)] transition-colors"
              >
                <div className="iconbadge w-10 h-10 rounded-lg grid place-items-center flex-shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-[var(--font-outfit)] font-semibold text-[0.95rem]">{venue.name}</p>
                  <p className="text-[0.74rem] text-muted-foreground mt-0.5 font-mono">
                    {venue.dataCenter} · {venue.world}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="tag capitalize">{roles.get(venue.id)?.toLowerCase()}</span>
                  <ChevronRight className="w-4 h-4 text-[var(--fg-faint)]" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick nav */}
      <div className="mt-8">
        <div className="section-label">
          <span className="sl-label muted">Account</span>
          <span className="ln" />
        </div>
        <div className="space-y-2">
          {navItems.map(({ icon: Icon, label, href, desc }) => (
            <Link
              key={href}
              href={href}
              className="vcard flex items-center gap-4 px-5 py-4 hover:border-[var(--blue-035)] transition-colors"
            >
              <div className="iconbadge w-10 h-10 rounded-lg grid place-items-center flex-shrink-0">
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-[var(--font-outfit)] font-semibold text-[0.9rem]">{label}</p>
                <p className="text-[0.74rem] text-muted-foreground mt-0.5">{desc}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-[var(--fg-faint)] flex-shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
