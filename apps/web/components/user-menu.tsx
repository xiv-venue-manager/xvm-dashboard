"use client"

import { signOut } from "next-auth/react"
import Link from "next/link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ChevronDown, User, Settings, Heart, ArrowLeftRight, HelpCircle, LogOut } from "lucide-react"

interface UserMenuProps {
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
  }
  currentVenueName?: string
  currentVenueRole?: string
}

export function UserMenu({ user, currentVenueName, currentVenueRole }: UserMenuProps) {
  const initials = user.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U"

  const roleLabel = currentVenueRole ? currentVenueRole.charAt(0) + currentVenueRole.slice(1).toLowerCase() : null

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button className="user-chip" aria-label="Open user menu">
              <Avatar className="h-7 w-7 flex-shrink-0">
                <AvatarImage src={user.image || undefined} alt={user.name || "User"} />
                <AvatarFallback className="text-[0.7rem] font-bold text-white user-chip-av">{initials}</AvatarFallback>
              </Avatar>
              <span className="user-chip-name hidden lg:block">{user.name || "User"}</span>
              <ChevronDown className="h-[15px] w-[15px] text-[var(--fg-faint)] flex-shrink-0 hidden lg:block" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent className="lg:hidden">{user.name || "Account"}</TooltipContent>
      </Tooltip>

      <DropdownMenuContent
        align="end"
        className="w-[220px] p-0 border-[var(--blue-018)] overflow-hidden"
        style={{ background: "rgba(10,15,30,0.97)", backdropFilter: "blur(20px)" }}
      >
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-[var(--blue-008)]">
          <p className="text-[0.875rem] font-semibold leading-tight">{user.name || "User"}</p>
          {roleLabel || currentVenueName ? (
            <p className="text-[0.74rem] text-muted-foreground mt-0.5">
              {[roleLabel, currentVenueName].filter(Boolean).join(" · ")}
            </p>
          ) : user.email ? (
            <p className="text-[0.74rem] text-muted-foreground mt-0.5 truncate">{user.email}</p>
          ) : null}
        </div>

        {/* Group 1: profile actions */}
        <div className="py-1.5">
          <DropdownMenuItem asChild className="user-menu-item">
            <Link href="/dashboard/account">
              <User className="h-[15px] w-[15px]" />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="user-menu-item">
            <Link href="/dashboard/account/settings">
              <Settings className="h-[15px] w-[15px]" />
              Account settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="user-menu-item">
            <Link href="/following">
              <Heart className="h-[15px] w-[15px]" />
              Venues you follow
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="user-menu-item">
            <Link href="/dashboard">
              <ArrowLeftRight className="h-[15px] w-[15px]" />
              Switch venue
            </Link>
          </DropdownMenuItem>
        </div>

        <DropdownMenuSeparator className="bg-[var(--blue-008)] my-0" />

        {/* Group 2: help + sign out */}
        <div className="py-1.5">
          <DropdownMenuItem asChild className="user-menu-item">
            <Link href="/guide/owner">
              <HelpCircle className="h-[15px] w-[15px]" />
              Help &amp; guide
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => signOut({ callbackUrl: "/" })}
            className="user-menu-item text-[var(--support-pink)] focus:text-[var(--support-pink)] focus:bg-[rgba(243,139,168,0.08)] cursor-pointer"
          >
            <LogOut className="h-[15px] w-[15px]" />
            Sign out
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
