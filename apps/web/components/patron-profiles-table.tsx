"use client"

import { useState } from "react"
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
  venueId,
  canModerate,
}: {
  profiles: PatronProfile[]
  venueId: string
  canModerate: boolean
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("all")
  const [search, setSearch] = useState("")
  const [localProfiles, setLocalProfiles] = useState(profiles)
  const [banningId, setBanningId] = useState<string | null>(null) // row currently showing the reason input
  const [banReasonInput, setBanReasonInput] = useState("")
  const [pendingBanIds, setPendingBanIds] = useState<Set<string>>(new Set())

  async function setBan(patron: PatronProfile, isBanned: boolean, reason?: string) {
    if (!patron.id || pendingBanIds.has(patron.id)) return
    setPendingBanIds((prev) => new Set(prev).add(patron.id))
    const prevBanned = patron.isBanned
    const prevReason = patron.banReason
    setLocalProfiles((prev) =>
      prev.map((p) =>
        p.id === patron.id ? { ...p, isBanned, banReason: isBanned ? (reason ?? p.banReason) : p.banReason } : p
      )
    )
    try {
      const res = await fetch(`/api/venues/${venueId}/patrons/${patron.id}/ban`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isBanned ? { isBanned: true, reason } : { isBanned: false }),
      })
      if (!res.ok) throw new Error("request failed")
    } catch {
      setLocalProfiles((prev) =>
        prev.map((p) => (p.id === patron.id ? { ...p, isBanned: prevBanned, banReason: prevReason } : p))
      )
    } finally {
      setPendingBanIds((prev) => {
        const next = new Set(prev)
        next.delete(patron.id)
        return next
      })
    }
  }

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
                    <span className="gil">{p.totalSpent.toLocaleString("en-US")}</span>
                  ) : (
                    <span className="t-muted">—</span>
                  )}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {p.isBanned && (
                      <span className="tag danger" title={p.banReason ?? undefined}>
                        Banned
                      </span>
                    )}
                    {canModerate && p.id && !p.isBanned && banningId !== p.id && (
                      <button
                        type="button"
                        onClick={() => {
                          setBanningId(p.id)
                          setBanReasonInput("")
                        }}
                        className="tag danger"
                        style={{ cursor: "pointer" }}
                      >
                        Ban
                      </button>
                    )}
                    {canModerate && p.id && p.isBanned && (
                      <button
                        type="button"
                        onClick={() => setBan(p, false)}
                        disabled={pendingBanIds.has(p.id)}
                        className="tag neutral"
                        style={{
                          cursor: pendingBanIds.has(p.id) ? "default" : "pointer",
                          opacity: pendingBanIds.has(p.id) ? 0.6 : 1,
                        }}
                      >
                        Unban
                      </button>
                    )}
                    {canModerate && p.id && banningId === p.id && (
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <input
                          type="text"
                          value={banReasonInput}
                          onChange={(e) => setBanReasonInput(e.target.value)}
                          placeholder="Reason…"
                          style={{ fontSize: "0.75rem", padding: "2px 6px", width: 120 }}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (!banReasonInput.trim()) return
                            const reason = banReasonInput.trim()
                            setBanningId(null)
                            setBanReasonInput("")
                            setBan(p, true, reason)
                          }}
                          disabled={!banReasonInput.trim() || pendingBanIds.has(p.id)}
                          className="tag danger"
                          style={{ cursor: "pointer" }}
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBanningId(null)
                            setBanReasonInput("")
                          }}
                          className="tag neutral"
                          style={{ cursor: "pointer" }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
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
