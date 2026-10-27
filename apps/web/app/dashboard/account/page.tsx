import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { myVenues } from "@/lib/api/venue-access"
import { getMe } from "@/lib/api/xvm-api"
import { getValidXvmApiToken } from "@/lib/api/xvm-api-store"
import { Settings, Scroll, Building2, ChevronRight } from "lucide-react"

export default async function ProfilePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/auth/signin")

  const { user } = session

  const token = await getValidXvmApiToken(session.user.id)
  const displayName = token ? ((await getMe(token).catch(() => null))?.person?.display_name ?? null) : null

  const venues = (await myVenues(session.user.id).catch(() => [])).sort((a, b) => a.name.localeCompare(b.name))

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
                  <span className="tag capitalize">{venue.role.toLowerCase()}</span>
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
