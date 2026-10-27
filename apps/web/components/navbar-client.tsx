"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { UserMenu } from "./user-menu"
import { FeedbackDialog } from "./feedback-dialog"
import { useSidebar } from "./sidebar-context"
import { Menu, Heart, Bell, CheckCheck, LayoutDashboard } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { LocalTime } from "@/components/server-time"
import type { Session } from "next-auth"

interface NavbarClientProps {
  session: Session | null
  venues: Array<{ id: string; name: string; slug: string; role: string }>
}

export function NavbarClient({ session, venues }: NavbarClientProps) {
  const { toggle } = useSidebar()
  const pathname = usePathname()
  const [notifications, setNotifications] = useState<
    Array<{ id: string; type: string; title: string; body: string; link?: string; read: boolean; createdAt: string }>
  >([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifOpen, setNotifOpen] = useState(false)

  // True for any page that has a sidebar: venue dashboard pages, discover, following
  // Excludes /dashboard/account/* (personal pages with no sidebar)
  const isVenuePage = !!(
    pathname?.match(/^\/dashboard\/(?!account)[^/]+(?:\/|$)/) ||
    pathname === "/discover" ||
    pathname === "/following"
  )

  // Current venue context for user chip subtitle
  const currentSlug = pathname?.match(/^\/dashboard\/([^/]+)/)?.[1]
  const currentVenue = currentSlug ? venues.find((v) => v.slug === currentSlug) : undefined

  // Fetch notifications on mount + every 60s
  useEffect(() => {
    if (!session) return
    let cancelled = false
    const fetchNotifs = async () => {
      try {
        const res = await fetch("/api/notifications")
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (!cancelled) {
          setNotifications(data.notifications)
          setUnreadCount(data.unreadCount)
        }
      } catch {
        /* silent */
      }
    }
    fetchNotifs()
    const interval = setInterval(fetchNotifs, 60_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [session])

  const markAllRead = async () => {
    if (unreadCount === 0) return
    setUnreadCount(0)
    setNotifications((n) => n.map((x) => ({ ...x, read: true })))
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
  }

  return (
    <nav className="sticky top-0 z-50 w-full xiv-nav xiv-glass relative">
      <div className="h-[60px] flex items-center gap-5 px-6">
        {/* Hamburger — left of brand, only visible below 1081px on venue pages */}
        {isVenuePage && (
          <button
            onClick={toggle}
            className="[@media(min-width:1081px)]:hidden p-[6px] rounded-[calc(0.75rem-4px)] text-foreground hover:bg-[var(--blue-007)] transition-colors flex-shrink-0"
            aria-label="Toggle navigation"
          >
            <Menu className="w-[22px] h-[22px]" />
          </button>
        )}

        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 group flex-shrink-0" aria-label="XIV Venue Manager home">
          <Image
            src="/xiv-icon.png"
            alt=""
            width={32}
            height={32}
            className="object-contain transition-opacity group-hover:opacity-90"
            priority
          />
          <span className="hidden sm:flex items-baseline gap-1.5 font-cinzel tracking-wide">
            <span className="font-bold text-base text-xiv">XIV</span>
            <span className="font-medium text-sm text-foreground/80">Venue Manager</span>
          </span>
        </Link>

        <div className="flex-1" />

        {/* Right */}
        <div className="flex items-center gap-[14px]">
          {session ? (
            <>
              {/* Dashboard shortcut — hidden once you're already on a venue page, the sidebar covers it there */}
              {!isVenuePage && venues.length > 0 && (
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)]"
                >
                  <Link href={venues.length === 1 ? `/dashboard/${venues[0].slug}` : "/dashboard"}>
                    <LayoutDashboard className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">Dashboard</span>
                  </Link>
                </Button>
              )}

              {/* Bell */}
              <Popover
                open={notifOpen}
                onOpenChange={(o) => {
                  setNotifOpen(o)
                  if (o) markAllRead()
                }}
              >
                <PopoverTrigger asChild>
                  <button
                    className="relative p-[7px] rounded-[var(--radius-md)] text-muted-foreground hover:text-foreground hover:bg-[var(--blue-007)] transition-colors"
                    aria-label="Notifications"
                  >
                    <Bell className="h-[19px] w-[19px]" />
                    {unreadCount > 0 && (
                      <span className="absolute top-[5px] right-[5px] min-w-[7px] h-[7px] rounded-full bg-[var(--xiv-blue)] border-2 border-background" />
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-80 p-0 border-[var(--blue-018)] bg-[rgba(7,11,20,0.97)] backdrop-blur-2xl"
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--blue-008)]">
                    <span className="font-semibold text-sm">Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllRead}
                        className="flex items-center gap-1.5 text-xs text-[var(--xiv-blue)] hover:underline"
                      >
                        <CheckCheck className="h-3 w-3" /> Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                        <Bell className="h-8 w-8 text-[var(--fg-faint)] mb-3 opacity-30" />
                        <p className="text-sm text-muted-foreground">No notifications yet</p>
                        <p className="text-xs text-[var(--fg-faint)] mt-1">
                          Followers, staff joins, and task assignments appear here
                        </p>
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <a
                          key={n.id}
                          href={n.link ?? "#"}
                          onClick={() => setNotifOpen(false)}
                          className={`flex gap-3 px-4 py-3 border-b border-[var(--blue-008)] last:border-b-0 hover:bg-[var(--blue-007)] transition-colors ${n.read ? "opacity-60" : ""}`}
                        >
                          <span
                            className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${n.read ? "bg-transparent" : "bg-[var(--xiv-blue)]"}`}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-tight">{n.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.body}</p>
                            <p className="text-[0.68rem] text-[var(--fg-faint)] mt-1">
                              <LocalTime date={n.createdAt} formatStr="datetime" />
                            </p>
                          </div>
                        </a>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              <FeedbackDialog />

              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-[var(--support-pink)] hover:text-pink-300 hover:bg-[rgba(243,139,168,0.08)]"
              >
                <Link
                  href="https://ko-fi.com/ehnocure"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Support on Ko-fi"
                >
                  <Heart className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">Support</span>
                </Link>
              </Button>

              <UserMenu
                user={session.user}
                currentVenueName={currentVenue?.name}
                currentVenueRole={currentVenue?.role}
              />
            </>
          ) : (
            <>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-pink-400 hover:text-pink-300 hover:bg-pink-500/10"
              >
                <Link
                  href="https://ko-fi.com/ehnocure"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Support on Ko-fi"
                >
                  <Heart className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">Support</span>
                </Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-sm text-foreground/60 hover:text-foreground hover:bg-[rgba(0,180,255,0.06)]"
              >
                <Link href="/auth/signin">Sign In</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
