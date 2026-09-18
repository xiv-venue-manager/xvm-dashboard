"use client"

import { useState, type CSSProperties } from "react"
import Link from "next/link"
import { LocalTime } from "@/components/server-time"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChevronDown, Check, Pencil, X, AtSign } from "lucide-react"
import { resolveDisplayName } from "@/lib/display-name"
import { intColorToHex } from "@/lib/api/position-convert"
import { DataTable } from "@/components/ui/data-table"

export type StaffMember = {
  id: number
  role: "OWNER" | "MANAGER" | "STAFF"
  // xvm-api's Position model has no primary/secondary distinction the way
  // Prisma's customRole vs additionalRoles did - every assigned position
  // renders the same way now (see rolePillStyle below).
  additionalRoles: { name: string; color: number | null }[]
  joinedAt: string | null
  isOnShift: boolean
  nickname: string | null
  user: {
    id: number
    name: string | null
    displayName: string | null
    image: string | null
    // xvm-api's MembershipPerson doesn't expose a character name yet
    // (xvm-api#54) - always null until that lands.
    characterName: string | null
    // Manager-only per xvm-api - null for a staff-tier reader or an
    // unlinked Discord account.
    discordId: string | null
  } | null
  venueId: string
}

function memberDisplayName(member: Pick<StaffMember, "nickname" | "user">): string {
  return resolveDisplayName({
    characterName: member.user?.characterName,
    nickname: member.nickname,
    displayName: member.user?.displayName,
    discordName: member.user?.name,
  })
}

function DiscordMentionButton({ discordId }: { discordId: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(`<@${discordId}>`).catch(() => {})
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-[var(--fg-faint)] hover:text-[var(--xiv-blue)]"
      title={copied ? "Copied!" : "Copy Discord mention"}
      aria-label={copied ? "Copied!" : "Copy Discord mention"}
    >
      {copied ? <Check className="w-3 h-3" /> : <AtSign className="w-3 h-3" />}
    </button>
  )
}

const DEFAULT_ROLE_COLOR = "#6c7086"

function rolePillStyle(color: number | null): CSSProperties {
  const hex = intColorToHex(color) ?? DEFAULT_ROLE_COLOR
  return { color: hex, borderColor: hex + "55", background: hex + "18" }
}

const ROLE_ORDER: Record<string, number> = { OWNER: 0, MANAGER: 1, STAFF: 2 }

const rolePill: Record<string, string> = {
  OWNER: "bg-[rgba(249,226,175,0.10)] text-[var(--warning)] border border-[rgba(249,226,175,0.28)]",
  MANAGER: "bg-[rgba(0,180,255,0.10)] text-[var(--xiv-blue)] border border-[rgba(0,180,255,0.28)]",
  STAFF: "bg-[rgba(108,112,134,0.12)] text-muted-foreground border border-[var(--border)]",
}

type Filter = "all" | "owner" | "manager" | "staff"

export function StaffTable({
  members: initialMembers,
  slug,
  canManage,
}: {
  members: StaffMember[]
  slug: string
  canManage: boolean
}) {
  const [members, setMembers] = useState(initialMembers)
  // router.refresh() re-renders the parent server component with fresh data,
  // but this component's own state wouldn't otherwise pick up the new
  // initialMembers array - confirmed live: a rehired member stayed missing
  // from this table until a hard reload without this sync. Adjusting state
  // during render (React's documented pattern for this) rather than in a
  // useEffect, which would call setState after an extra render pass.
  const [prevInitialMembers, setPrevInitialMembers] = useState(initialMembers)
  if (initialMembers !== prevInitialMembers) {
    setPrevInitialMembers(initialMembers)
    setMembers(initialMembers)
  }
  const [filter, setFilter] = useState<Filter>("all")
  const [search, setSearch] = useState("")
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState("")
  const [saving, setSaving] = useState(false)

  async function saveNickname(member: StaffMember) {
    setSaving(true)
    const trimmed = editValue.trim() || null
    try {
      const res = await fetch(`/api/venues/${member.venueId}/staff/${member.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: trimmed }),
      })
      if (res.ok) {
        setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, nickname: trimmed } : m)))
      }
    } finally {
      setSaving(false)
      setEditingId(null)
    }
  }

  function startEdit(member: StaffMember) {
    setEditingId(member.id)
    setEditValue(member.nickname ?? "")
  }

  // Extract unique position names for additional filter tabs - xvm-api has
  // no primary/secondary distinction, so this is the union of every
  // position assigned across all members, not a single "custom role".
  const positionNames = Array.from(new Set(members.flatMap((m) => m.additionalRoles.map((r) => r.name)))).sort()

  const counts = {
    all: members.length,
    owner: members.filter((m) => m.role === "OWNER").length,
    manager: members.filter((m) => m.role === "MANAGER").length,
    staff: members.filter((m) => m.role === "STAFF").length,
    ...Object.fromEntries(
      positionNames.map((name) => [
        name,
        members.filter((m) => m.additionalRoles.some((r) => r.name === name)).length,
      ])
    ),
  }

  const visible = members
    .filter((m) => {
      if (filter === "owner" && m.role !== "OWNER") return false
      if (filter === "manager" && m.role !== "MANAGER") return false
      if (filter === "staff" && m.role !== "STAFF") return false
      // Position filter
      if (positionNames.includes(filter) && !m.additionalRoles.some((r) => r.name === filter)) return false
      if (search) {
        const q = search.toLowerCase()
        // Match on every name this member could be known by, not just the
        // one that currently wins resolveDisplayName's priority order -
        // a character name shouldn't shadow a nickname/displayName search.
        if (
          !(m.user?.characterName ?? "").toLowerCase().includes(q) &&
          !(m.nickname ?? "").toLowerCase().includes(q) &&
          !(m.user?.displayName ?? "").toLowerCase().includes(q) &&
          !(m.user?.name ?? "").toLowerCase().includes(q) &&
          !m.additionalRoles.some((r) => r.name.toLowerCase().includes(q))
        )
          return false
      }
      return true
    })
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role])

  const tabs: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "owner", label: "Owners" },
    { key: "manager", label: "Managers" },
    { key: "staff", label: "Staff" },
    // Add position tabs matching prototype (Hosts, Bar, DJ, etc.)
    ...positionNames.map((name) => ({ key: name as Filter, label: name })),
  ]

  return (
    <div>
      {/* Filter bar — role select + search on one line */}
      <div className="flex items-center gap-3 mb-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 h-9 px-3 rounded-[var(--radius-md)] border border-[var(--blue-015)] bg-[var(--card)] text-sm font-medium text-foreground hover:border-[var(--blue-035)] hover:bg-[var(--blue-007)] transition-colors flex-shrink-0">
              <span className="max-w-[120px] truncate">{tabs.find((t) => t.key === filter)?.label ?? "All"}</span>
              <span className="text-[0.68rem] text-[var(--fg-faint)]">{counts[filter] ?? 0}</span>
              <ChevronDown className="w-3.5 h-3.5 text-[var(--fg-faint)] flex-shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[200px]">
            {/* System roles */}
            {tabs
              .filter((t) => ["all", "owner", "manager", "staff"].includes(t.key))
              .map(({ key, label }) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`flex items-center justify-between gap-2 cursor-pointer ${filter === key ? "text-[var(--xiv-blue)]" : ""}`}
                >
                  <span>{label}</span>
                  <span className="text-[0.68rem] text-[var(--fg-faint)]">{counts[key] ?? 0}</span>
                  {filter === key && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                </DropdownMenuItem>
              ))}
            {/* Positions — only shown if any exist */}
            {tabs.some((t) => !["all", "owner", "manager", "staff"].includes(t.key)) && (
              <>
                <DropdownMenuSeparator className="bg-[var(--blue-008)]" />
                {tabs
                  .filter((t) => !["all", "owner", "manager", "staff"].includes(t.key))
                  .map(({ key, label }) => (
                    <DropdownMenuItem
                      key={key}
                      onClick={() => setFilter(key)}
                      className={`flex items-center justify-between gap-2 cursor-pointer ${filter === key ? "text-[var(--xiv-blue)]" : ""}`}
                    >
                      <span>{label}</span>
                      <span className="text-[0.68rem] text-[var(--fg-faint)]">{counts[key] ?? 0}</span>
                      {filter === key && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                    </DropdownMenuItem>
                  ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="search">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input placeholder="Search staff…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <div className="panel">
        <DataTable
          columns={[
            { label: "Staff" },
            { label: "Role" },
            { label: "Status", hideOnMobile: true },
            { label: "Joined", hideOnMobile: true },
            { label: "", align: "right" },
          ]}
          isEmpty={visible.length === 0}
          emptyMessage="No staff found."
        >
          {visible.map((member) => (
            <tr key={member.id}>
              {/* Name */}
              <td className="w-[300px]">
                <div className="flex items-center gap-3">
                  <Avatar className="w-8 h-8 flex-shrink-0">
                    <AvatarImage src={member.user?.image ?? undefined} />
                    <AvatarFallback className="text-[0.65rem] font-bold bg-gradient-to-br from-[var(--xiv-blue)] to-blue-700 text-white">
                      {memberDisplayName(member).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {editingId === member.id ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveNickname(member)
                          if (e.key === "Escape") setEditingId(null)
                        }}
                        placeholder={member.user?.name ?? "Nickname…"}
                        className="h-7 w-36 text-sm py-0 px-2"
                        maxLength={50}
                        disabled={saving}
                      />
                      <button
                        onClick={() => saveNickname(member)}
                        disabled={saving}
                        className="text-[var(--xiv-blue)] hover:opacity-70 transition-opacity disabled:opacity-40"
                        aria-label="Save nickname"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        disabled={saving}
                        className="text-[var(--fg-faint)] hover:opacity-70 transition-opacity"
                        aria-label="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 group">
                      <div>
                        <span className="text-sm font-medium">{memberDisplayName(member)}</span>
                        {member.nickname && (
                          <p className="text-[0.65rem] text-[var(--fg-faint)] leading-tight">{member.user?.name}</p>
                        )}
                      </div>
                      {canManage && (
                        <button
                          onClick={() => startEdit(member)}
                          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-[var(--fg-faint)] hover:text-[var(--xiv-blue)]"
                          aria-label="Edit nickname"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                      {canManage && member.user?.discordId && (
                        <DiscordMentionButton discordId={member.user.discordId} />
                      )}
                    </div>
                  )}
                </div>
              </td>

              {/* Role */}
              <td>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[0.7rem] font-medium px-2.5 py-0.5 rounded-full ${rolePill[member.role]}`}>
                    {member.role.charAt(0) + member.role.slice(1).toLowerCase()}
                  </span>
                  {member.additionalRoles.map((role) => (
                    <span
                      key={role.name}
                      className="text-[0.7rem] font-medium px-2.5 py-0.5 rounded-full border"
                      style={rolePillStyle(role.color)}
                    >
                      {role.name}
                    </span>
                  ))}
                </div>
              </td>

              {/* On-shift status */}
              <td className="hide">
                {member.isOnShift ? (
                  <span className="inline-flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.04em] px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 relative">
                      <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
                    </span>
                    On shift
                  </span>
                ) : (
                  <span className="text-[0.72rem] text-[var(--fg-faint)]">Off shift</span>
                )}
              </td>

              {/* Joined */}
              <td className="hide t-muted whitespace-nowrap">
                {member.joinedAt ? (
                  <LocalTime date={member.joinedAt} formatStr="datewithyear" />
                ) : (
                  <span className="text-[var(--fg-faint)]">—</span>
                )}
              </td>

              {/* Actions */}
              <td className="t-num">
                {canManage && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/dashboard/${slug}/staff/${member.id}`}>Edit</Link>
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      </div>
    </div>
  )
}
