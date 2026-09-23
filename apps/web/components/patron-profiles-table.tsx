"use client"

import { useState } from "react"
import Link from "next/link"
import { formatLocalTime } from "@/components/server-time"
import { History, Repeat, UserPlus } from "lucide-react"
import { DataTable } from "@/components/ui/data-table"

export type PatronProfile = {
  id: string
  characterName: string
  world: string
  visits: number
  lastSeen: string // ISO
  totalSpent?: number
  isBanned: boolean
  banReason: string | null
}

export function patronTag(visits: number): "regular" | "new" {
  if (visits >= 3) return "regular"
  return "new"
}

type TabKey = "all" | "regular" | "new"

export function PatronProfilesTable({
  profiles,
  venueSlug,
  canModerate,
}: {
  profiles: PatronProfile[]
  venueSlug: string
  canModerate: boolean
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("all")
  const [search, setSearch] = useState("")
  const localProfiles = profiles

  const counts = {
    all: localProfiles.length,
    regular: localProfiles.filter((p) => patronTag(p.visits) === "regular").length,
    new: localProfiles.filter((p) => patronTag(p.visits) === "new").length,
  }

  const visible = localProfiles.filter((p) => {
    if (activeTab !== "all" && patronTag(p.visits) !== activeTab) return false
    if (
      search &&
      !p.characterName.toLowerCase().includes(search.toLowerCase()) &&
      !p.world.toLowerCase().includes(search.toLowerCase())
    )
      return false
    return true
  })

  const tabs: { key: TabKey; label: string }[] = [
    { key: "all", label: "All" },
    { key: "regular", label: "Regulars" },
    { key: "new", label: "New" },
  ]

  return (
    <div>
      {/* KPIs */}
      <div className="kpis mb-2">
        <div className="stat">
          <div className="top">
            <span className="sb">
              <History />
            </span>
          </div>
          <div className="k">Unique patrons</div>
          <div className="v">{localProfiles.length}</div>
          <div className="delta flat">all time</div>
        </div>
        <div className="stat">
          <div className="top">
            <span className="sb">
              <Repeat />
            </span>
          </div>
          <div className="k">Regulars</div>
          <div className="v">{counts.regular}</div>
          <div className="delta flat">3+ visits</div>
        </div>
        <div className="stat">
          <div className="top">
            <span className="sb em">
              <UserPlus />
            </span>
          </div>
          <div className="k">New this period</div>
          <div className="v">{counts.new}</div>
          <div className="delta flat">1–2 visits</div>
        </div>
      </div>

      {canModerate && (
        <p className="text-sm text-muted-foreground mb-2">
          To ban or unban a patron, use the{" "}
          <Link href={`/dashboard/${venueSlug}/ban-list`} className="underline">
            Ban List
          </Link>
          .
        </p>
      )}

      {/* Filters */}
      <div className="filters">
        <div className="tabs">
          {tabs.map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)} className={`tab${activeTab === key ? " active" : ""}`}>
              {label}
              <span style={{ fontSize: "0.68rem", opacity: activeTab === key ? 0.7 : 0.5 }}>{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="search">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input type="text" placeholder="Search patrons…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <div className="panel">
        <DataTable
          columns={[
            { label: "Patron" },
            { label: "World", hideOnMobile: true },
            { label: "Visits", align: "right" },
            { label: "Last seen", hideOnMobile: true },
            { label: "Total spent", align: "right", hideOnMobile: true },
            { label: "Tags" },
          ]}
          isEmpty={visible.length === 0}
          emptyMessage="No patrons found."
        >
          {visible.map((p) => {
            const t = patronTag(p.visits)
            const initials = p.characterName
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()
            return (
              <tr key={`${p.characterName}|${p.world}`}>
                <td>
                  <div className="cellrow">
                    <span className="av-sm">{initials}</span>
                    <span className="t-name">{p.characterName}</span>
                  </div>
                </td>
                <td className="hide t-muted">{p.world || "—"}</td>
                <td className="t-num">{p.visits}</td>
                <td className="hide t-muted">{formatLocalTime(p.lastSeen, "datetime")}</td>
                <td className="t-num hide">
                  {p.totalSpent && p.totalSpent > 0 ? (
                    <span className="gil">{p.totalSpent.toLocaleString()}</span>
                  ) : (
                    <span className="t-muted">—</span>
                  )}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {t === "regular" && <span className="tag neutral">Regular</span>}
                    {t === "new" && <span className="tag em">New</span>}
                  </div>
                </td>
              </tr>
            )
          })}
        </DataTable>
      </div>
    </div>
  )
}
