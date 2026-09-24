"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { formatLocalTime } from "@/components/server-time"
import { DataTable } from "@/components/ui/data-table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

export type BannedPatron = {
  id: string
  characterName: string
  world: string
  banReason: string | null
  bannedAt: string | null
  bannedBy: { id: string; name: string | null } | null
}

const NOT_CONNECTED_MESSAGE = "Ask the venue owner to connect this venue to xvm-api first."

export function BanListManager({
  venueId,
  patrons,
  notConnected,
}: {
  venueId: string
  patrons: BannedPatron[]
  notConnected?: boolean
}) {
  const router = useRouter()
  const [localPatrons, setLocalPatrons] = useState(patrons)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [characterName, setCharacterName] = useState("")
  const [world, setWorld] = useState("")
  const [reason, setReason] = useState("")
  const [isBanning, setIsBanning] = useState(false)
  const [banError, setBanError] = useState<string | null>(null)

  const [seenPatrons, setSeenPatrons] = useState(patrons)
  if (patrons !== seenPatrons) {
    setSeenPatrons(patrons)
    setLocalPatrons(patrons)
  }

  async function banByName() {
    if (isBanning) return
    setIsBanning(true)
    setBanError(null)
    try {
      const res = await fetch(`/api/venues/${venueId}/patrons/bans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterName, world, reason }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.message ?? "Couldn't ban that patron. Check the name, world and reason and try again.")
      }
      setCharacterName("")
      setWorld("")
      setReason("")
      router.refresh()
    } catch (err) {
      setBanError(err instanceof Error ? err.message : "Couldn't ban that patron.")
    } finally {
      setIsBanning(false)
    }
  }

  async function unban(patron: BannedPatron) {
    if (pendingIds.has(patron.id)) return
    setPendingIds((prev) => new Set(prev).add(patron.id))
    setLocalPatrons((prev) => prev.filter((p) => p.id !== patron.id))
    try {
      const res = await fetch(`/api/venues/${venueId}/patrons/${patron.id}/ban`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isBanned: false }),
      })
      if (!res.ok) throw new Error("request failed")
    } catch {
      setLocalPatrons((prev) => (prev.some((p) => p.id === patron.id) ? prev : [...prev, patron]))
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(patron.id)
        return next
      })
    }
  }

  if (notConnected) {
    return (
      <Alert>
        <AlertDescription>{NOT_CONNECTED_MESSAGE}</AlertDescription>
      </Alert>
    )
  }

  const inputClass =
    "rounded-[var(--radius-sm)] border border-[var(--blue-015)] bg-background px-3 py-1.5 text-sm focus:border-[var(--blue-035)] focus:outline-none"

  return (
    <div className="panel">
      <form
        className="flex flex-wrap items-center gap-2 mb-4"
        onSubmit={(e) => {
          e.preventDefault()
          void banByName()
        }}
      >
        <input
          type="text"
          value={characterName}
          onChange={(e) => setCharacterName(e.target.value)}
          placeholder="Character name"
          maxLength={40}
          className={`${inputClass} flex-1 min-w-[10rem]`}
        />
        <input
          type="text"
          value={world}
          onChange={(e) => setWorld(e.target.value)}
          placeholder="World"
          maxLength={32}
          className={`${inputClass} w-36`}
        />
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason"
          maxLength={500}
          className={`${inputClass} flex-1 min-w-[10rem]`}
        />
        <Button type="submit" size="sm" disabled={isBanning || !characterName.trim() || !world.trim() || !reason.trim()}>
          Ban
        </Button>
      </form>
      {banError && (
        <Alert className="mb-4">
          <AlertDescription>{banError}</AlertDescription>
        </Alert>
      )}
      <DataTable
        columns={[
          { label: "Patron" },
          { label: "World", hideOnMobile: true },
          { label: "Reason" },
          { label: "Banned by", hideOnMobile: true },
          { label: "Banned at", hideOnMobile: true },
          { label: "" },
        ]}
        isEmpty={localPatrons.length === 0}
        emptyMessage="No patrons currently banned."
      >
        {localPatrons.map((p) => (
          <tr key={p.id}>
            <td className="t-name">{p.characterName}</td>
            <td className="hide t-muted">{p.world || "—"}</td>
            <td>{p.banReason || <span className="t-muted">—</span>}</td>
            <td className="hide t-muted">{p.bannedBy?.name ?? "—"}</td>
            <td className="hide t-muted">{p.bannedAt ? formatLocalTime(p.bannedAt, "datetime") : "—"}</td>
            <td>
              <button
                type="button"
                onClick={() => unban(p)}
                disabled={pendingIds.has(p.id)}
                className="tag neutral"
                style={{
                  cursor: pendingIds.has(p.id) ? "default" : "pointer",
                  opacity: pendingIds.has(p.id) ? 0.6 : 1,
                }}
              >
                Unban
              </button>
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  )
}
