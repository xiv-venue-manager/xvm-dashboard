"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { VenueSwitcher } from "./venue-switcher"
import { FeedbackDialog } from "./feedback-dialog"
import { useSidebar } from "./sidebar-context"
import { cn } from "@/lib/utils"
import { useMounted } from "@/lib/use-mounted"
import {
  Heart,
  Home,
  BarChart3,
  Calendar,
  Radio,
  Users,
  Clock,
  CheckSquare,
  ShoppingBag,
  Gift,
  Coins,
  Scroll,
  History,
  Wallet,
  Settings,
  Compass,
  BookHeart,
  Ban,
  DoorOpen,
  type LucideIcon,
} from "lucide-react"

type VenueOption = { id: string; name: string; slug: string; dataCenter?: string; world?: string }

interface VenueSidebarProps {
  venueSlug: string
  venueName: string
  userRole: string
  userName?: string
  userEmail?: string
  venues?: VenueOption[]
  livePatronCount?: number
}

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  roles?: string[]
  badge?: number | string
}

interface NavGroup {
  label: string
  items: NavItem[]
}

// Root dashboard needs exact match to avoid every sub-page matching the prefix; child paths use prefix match so /dashboard/venue/events/new highlights /dashboard/venue/events.
const isActiveHref = (pathname: string, venueSlug: string, href: string) =>
  href === `/dashboard/${venueSlug}` ? pathname === href : pathname.startsWith(href)

const filterItems = (items: NavItem[], userRole: string) =>
  items.filter((item) => !item.roles || item.roles.includes(userRole))

interface NavContentProps {
  venueSlug: string
  venues: VenueOption[]
  navGroups: NavGroup[]
  pathname: string
  userRole: string
  onNavigate?: () => void
}

function NavContent({ venueSlug, venues, navGroups, pathname, userRole, onNavigate }: NavContentProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Venue switcher */}
      {venues.length > 0 && (
        <div className="px-3 pt-4 pb-3 border-b border-[var(--blue-008)]">
          <VenueSwitcher venues={venues} activeSlug={venueSlug} />
        </div>
      )}

      <div className="flex-1 py-3 overflow-y-auto sidebar-scroll">
        <nav className="px-[14px] space-y-5">
          {navGroups.map((group) => {
            const filtered = filterItems(group.items, userRole)
            if (!filtered.length) return null
            return (
              <div key={group.label}>
                <p className="grp-label px-3 mb-[8px]">{group.label}</p>
                <div className="space-y-0.5">
                  {filtered.map((item) => {
                    const active = isActiveHref(pathname, venueSlug, item.href)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center gap-3 px-3 py-[9px] rounded-lg text-[0.875rem] font-medium transition-colors border-l-2",
                          active
                            ? "bg-[var(--xiv-blue)] text-[var(--xiv-navy)] font-semibold border-[var(--xiv-blue)] shadow-[var(--glow-cta-soft)]"
                            : "text-foreground hover:bg-[var(--blue-007)] border-transparent"
                        )}
                      >
                        <item.icon
                          className={cn(
                            "h-[18px] w-[18px] shrink-0 transition-colors",
                            active ? "text-[var(--xiv-navy)]" : "text-muted-foreground"
                          )}
                        />
                        <span className="flex-1">{item.label}</span>
                        {item.badge !== undefined && item.badge !== null && (
                          <span
                            className={cn(
                              "text-[0.7rem] font-semibold px-2 py-px rounded-full min-w-[1.25rem] text-center",
                              active
                                ? "bg-[rgba(7,11,20,0.25)] text-[var(--xiv-navy)]"
                                : "bg-[var(--blue-012)] text-[var(--xiv-blue)]"
                            )}
                          >
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>
      </div>

      {/* Settings */}
      <div className="border-t border-[var(--blue-008)] p-[8px] space-y-0.5">
        <Link
          href={`/dashboard/${venueSlug}/settings`}
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 px-3 py-[9px] rounded-lg text-[0.875rem] font-medium transition-colors border-l-2",
            isActiveHref(pathname, venueSlug, `/dashboard/${venueSlug}/settings`)
              ? "bg-[var(--xiv-blue)] text-[var(--xiv-navy)] font-semibold border-[var(--xiv-blue)]"
              : "text-foreground hover:bg-[var(--blue-007)] border-transparent"
          )}
        >
          <Settings
            className={cn(
              "h-[18px] w-[18px] shrink-0",
              isActiveHref(pathname, venueSlug, `/dashboard/${venueSlug}/settings`)
                ? "text-[var(--xiv-navy)]"
                : "text-muted-foreground"
            )}
          />
          <span>Venue settings</span>
        </Link>
      </div>

      {/* Footer */}
      <div className="px-4 pb-[14px] pt-[12px] border-t border-[var(--blue-008)] space-y-2">
        <p className="text-[0.62rem] leading-[1.5] text-[var(--fg-faint)]">
          XIV Venue Manager is not affiliated with SQUARE ENIX CO., LTD.
        </p>
        <a
          href="https://frogge.tech/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[0.68rem] text-muted-foreground hover:text-foreground transition-colors"
        >
          <Image src="/frogge-icon.png" alt="" width={14} height={14} className="rounded-sm" />
          Powered by Frogge
        </a>
      </div>
    </div>
  )
}

interface MobileBottomProps {
  userName?: string
  userEmail?: string
  mounted: boolean
  onNavigate: () => void
}

function MobileBottom({ userName, userEmail, mounted, onNavigate }: MobileBottomProps) {
  return (
    <div className="p-3 border-t border-[var(--blue-008)] space-y-2">
      {userName && (
        <div className="pb-2 border-b border-[var(--blue-008)]">
          <p className="text-sm font-medium">{userName}</p>
          {mounted && userEmail && <p className="text-xs text-muted-foreground">{userEmail}</p>}
        </div>
      )}
      <div onClick={onNavigate}>
        <FeedbackDialog />
      </div>
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="w-full justify-start text-[var(--support-pink)] hover:text-pink-300 hover:bg-[rgba(243,139,168,0.08)]"
      >
        <Link href="https://ko-fi.com/ehnocure" target="_blank" rel="noopener noreferrer">
          <Heart className="h-4 w-4 mr-2" />
          Support the Project
        </Link>
      </Button>
      <Button asChild variant="outline" size="sm" className="w-full">
        <Link href="/api/auth/signout">Sign Out</Link>
      </Button>
    </div>
  )
}

export function VenueSidebar({
  venueSlug,
  venueName,
  userRole,
  userName,
  userEmail,
  venues = [],
  livePatronCount,
}: VenueSidebarProps) {
  const pathname = usePathname()
  const { open, setOpen } = useSidebar()
  const mounted = useMounted()

  const navGroups: NavGroup[] = [
    {
      label: "Explore",
      items: [
        { href: "/discover", label: "Discover", icon: Compass },
        { href: "/following", label: "Following", icon: BookHeart },
      ],
    },
    {
      label: "Manage",
      items: [
        { href: `/dashboard/${venueSlug}`, label: "Overview", icon: Home },
        {
          href: `/dashboard/${venueSlug}/analytics`,
          label: "Analytics",
          icon: BarChart3,
          roles: ["OWNER", "MANAGER"],
        },
        {
          href: `/dashboard/${venueSlug}/live`,
          label: "Live Mode",
          icon: Radio,
          badge: livePatronCount,
        },
      ],
    },
    {
      label: "Operations",
      items: [
        { href: `/dashboard/${venueSlug}/events`, label: "Events", icon: Calendar },
        { href: `/dashboard/${venueSlug}/staff`, label: "Staff", icon: Users },
        { href: `/dashboard/${venueSlug}/shifts`, label: "Shifts", icon: Clock },
        { href: `/dashboard/${venueSlug}/tasks`, label: "Tasks", icon: CheckSquare },
        { href: `/dashboard/${venueSlug}/services`, label: "Services", icon: ShoppingBag },
        { href: `/dashboard/${venueSlug}/services/contests`, label: "Contests", icon: Gift },
        { href: `/dashboard/${venueSlug}/rooms`, label: "Rooms", icon: DoorOpen },
      ],
    },
    {
      label: "Records",
      items: [
        { href: `/dashboard/${venueSlug}/sales`, label: "Sales", icon: Coins },
        {
          href: `/dashboard/${venueSlug}/payroll`,
          label: "Payroll",
          icon: Wallet,
          roles: ["OWNER", "MANAGER"],
        },
        { href: `/dashboard/${venueSlug}/timeline`, label: "Timeline", icon: Scroll },
        {
          href: `/dashboard/${venueSlug}/patron-logs`,
          label: "Patron Logs",
          icon: History,
          roles: ["OWNER", "MANAGER"],
        },
        {
          href: `/dashboard/${venueSlug}/ban-list`,
          label: "Ban List",
          icon: Ban,
          roles: ["OWNER", "MANAGER"],
        },
      ],
    },
  ]

  const close = () => setOpen(false)

  return (
    <>
      {/* Scrim overlay — mobile only when open */}
      {open && (
        <div
          className="[@media(min-width:1081px)]:hidden fixed inset-0 bg-[rgba(7,11,20,0.6)] backdrop-blur-[2px] z-[39]"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed z-40 flex flex-col overflow-hidden",
          "top-[80px] left-5 bottom-5 w-[260px]",
          "rounded-xl border border-[rgba(255,255,255,0.06)]",
          "xiv-sidebar-glass",
          // Desktop: always visible; mobile: slides in/out
          "[@media(min-width:1081px)]:translate-x-0",
          open
            ? "translate-x-0 transition-transform duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
            : "[@media(max-width:1080px)]:-translate-x-[calc(100%+24px)] transition-transform duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
        )}
      >
        <NavContent
          venueSlug={venueSlug}
          venues={venues}
          navGroups={navGroups}
          pathname={pathname}
          userRole={userRole}
          onNavigate={close}
        />
        <div className="[@media(min-width:1081px)]:hidden">
          <MobileBottom userName={userName} userEmail={userEmail} mounted={mounted} onNavigate={close} />
        </div>
      </aside>
    </>
  )
}
