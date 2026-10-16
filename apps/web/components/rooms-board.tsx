"use client"

import { useState, useEffect } from "react"
import { DataTable } from "@/components/ui/data-table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { Room } from "@/lib/api/xvm-api"

export type RoomItem = Room

const NOT_CONNECTED_MESSAGE = "Ask the venue owner to connect this venue to xvm-api first."

async function describeError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}))
  if (body?.error === "not_connected") return NOT_CONNECTED_MESSAGE
  return body?.error || body?.detail || fallback
}

function statusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case "disabled":
      return { label: "Disabled", className: "neutral" }
    case "locked":
      return { label: "Locked", className: "warning" }
    case "occupied":
      return { label: "Occupied", className: "danger" }
    case "available":
      return { label: "Available", className: "vip" }
    default:
      return { label: status, className: "neutral" }
  }
}

export type RoomPeopleNames = { byPersonId: Record<number, string>; byMembershipId: Record<number, string> }

// Names come from the venue roster, which a viewer may not be allowed to read; an id with no name falls back to a numeric label.
function reserverLabel(room: Room, names: RoomPeopleNames): string {
  const res = room.current_reservation
  if (res?.is_current) {
    if (res.reserved_character_name) {
      return res.reserved_world ? `${res.reserved_character_name} @ ${res.reserved_world}` : res.reserved_character_name
    }
    if (res.reserved_person_id != null) return names.byPersonId[res.reserved_person_id] ?? `Member #${res.reserved_person_id}`
  }
  if (room.owner_membership_id != null) return names.byMembershipId[room.owner_membership_id] ?? `Member #${room.owner_membership_id}`
  return "—"
}

export function RoomsBoard({
  venueSlug,
  canManage,
  rooms,
  names,
  notConnected,
}: {
  venueSlug: string
  canManage: boolean
  rooms: RoomItem[]
  names: RoomPeopleNames
  notConnected?: boolean
}) {
  const [localRooms, setLocalRooms] = useState(rooms)
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set())
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null)
  const [noteInput, setNoteInput] = useState("")
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameInput, setRenameInput] = useState("")
  const [newRoomName, setNewRoomName] = useState("")
  const [adding, setAdding] = useState(false)
  const [editingRoomNumberId, setEditingRoomNumberId] = useState<number | null>(null)
  const [roomNumberInput, setRoomNumberInput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RoomItem | null>(null)

  useEffect(() => {
    const es = new EventSource("/api/stream/" + venueSlug)
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type !== "room_status") return
        const d = msg.data as { roomId: number; name: string; isOccupied: boolean; status: string }
        setLocalRooms((prev) =>
          prev.map((r) =>
            r.id === d.roomId ? { ...r, status: d.status, current_reservation: d.isOccupied ? r.current_reservation : null } : r
          )
        )
      } catch {}
    }
    return () => es.close()
  }, [venueSlug])

  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null)
        setSuccess(null)
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [error, success])

  async function reserveRoom(room: RoomItem) {
    if (pendingIds.has(room.id)) return
    setPendingIds((prev) => new Set(prev).add(room.id))
    try {
      const res = await fetch(`/api/venues/${venueSlug}/rooms/${room.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reserve" }),
      })
      if (!res.ok) {
        setError(await describeError(res, "Failed to reserve room"))
        return
      }
      const updated: Room = await res.json()
      setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? updated : r)))
    } catch {
      setError("Failed to reserve room")
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(room.id)
        return next
      })
    }
  }

  async function releaseRoomAction(room: RoomItem) {
    if (pendingIds.has(room.id)) return
    setPendingIds((prev) => new Set(prev).add(room.id))
    try {
      const res = await fetch(`/api/venues/${venueSlug}/rooms/${room.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "release" }),
      })
      if (!res.ok) {
        setError(await describeError(res, "Failed to release room"))
        return
      }
      const updated: Room = await res.json()
      setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? updated : r)))
    } catch {
      setError("Failed to release room")
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(room.id)
        return next
      })
    }
  }

  async function saveNote(room: RoomItem) {
    const trimmed = noteInput.trim()
    setEditingNoteId(null)
    setNoteInput("")
    if (pendingIds.has(room.id)) return
    if (trimmed === (room.notes ?? "")) return
    setPendingIds((prev) => new Set(prev).add(room.id))
    const prevNotes = room.notes
    setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, notes: trimmed || null } : r)))
    try {
      const res = await fetch(`/api/venues/${venueSlug}/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: trimmed || null }),
      })
      if (!res.ok) {
        setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, notes: prevNotes } : r)))
        setError(await describeError(res, "Failed to save note"))
        return
      }
      const updated: Room = await res.json()
      setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? updated : r)))
    } catch {
      setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, notes: prevNotes } : r)))
      setError("Failed to save note")
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(room.id)
        return next
      })
    }
  }

  async function addRoom() {
    const name = newRoomName.trim()
    if (!name || adding) return
    setAdding(true)
    setError(null)
    try {
      const res = await fetch(`/api/venues/${venueSlug}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        setError(await describeError(res, "Failed to add room"))
        return
      }
      const created: Room = await res.json()
      setLocalRooms((prev) => [...prev, created])
      setNewRoomName("")
      setSuccess("Room added")
    } catch {
      setError("Network error adding room")
    } finally {
      setAdding(false)
    }
  }

  async function saveRename(room: RoomItem) {
    const name = renameInput.trim()
    setRenamingId(null)
    setRenameInput("")
    if (!name || name === room.name || pendingIds.has(room.id)) return
    setPendingIds((prev) => new Set(prev).add(room.id))
    const prevName = room.name
    setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, name } : r)))
    try {
      const res = await fetch(`/api/venues/${venueSlug}/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, name: prevName } : r)))
        setError(await describeError(res, "Failed to rename room"))
        return
      }
    } catch {
      setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, name: prevName } : r)))
      setError("Failed to rename room")
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(room.id)
        return next
      })
    }
  }

  async function saveRoomNumber(room: RoomItem) {
    setEditingRoomNumberId(null)
    if (pendingIds.has(room.id)) return
    const raw = roomNumberInput.trim()
    setRoomNumberInput("")
    const roomNumber = raw === "" ? null : parseInt(raw, 10)
    if (raw !== "" && (isNaN(roomNumber!) || roomNumber! < 0 || roomNumber! > 999)) {
      setError("Room number must be 0–999")
      return
    }
    if (roomNumber === room.room_number) return
    setPendingIds((prev) => new Set(prev).add(room.id))
    const prevNumber = room.room_number
    setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, room_number: roomNumber } : r)))
    try {
      const res = await fetch(`/api/venues/${venueSlug}/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomNumber }),
      })
      if (!res.ok) {
        setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, room_number: prevNumber } : r)))
        setError(await describeError(res, "Failed to update room number"))
        return
      }
    } catch {
      setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, room_number: prevNumber } : r)))
      setError("Failed to update room number")
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(room.id)
        return next
      })
    }
  }

  async function toggleLocked(room: RoomItem) {
    if (pendingIds.has(room.id)) return
    const nextLocked = !room.locked
    setPendingIds((prev) => new Set(prev).add(room.id))
    setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, locked: nextLocked } : r)))
    try {
      const res = await fetch(`/api/venues/${venueSlug}/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked: nextLocked }),
      })
      if (!res.ok) {
        setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, locked: room.locked } : r)))
        setError(await describeError(res, "Failed to update lock status"))
        return
      }
    } catch {
      setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, locked: room.locked } : r)))
      setError("Failed to update lock status")
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(room.id)
        return next
      })
    }
  }

  async function toggleDisabled(room: RoomItem) {
    if (pendingIds.has(room.id)) return
    const nextDisabled = !room.disabled
    setPendingIds((prev) => new Set(prev).add(room.id))
    setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, disabled: nextDisabled } : r)))
    try {
      const res = await fetch(`/api/venues/${venueSlug}/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: nextDisabled }),
      })
      if (!res.ok) {
        setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, disabled: room.disabled } : r)))
        setError(await describeError(res, "Failed to update disabled status"))
        return
      }
    } catch {
      setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, disabled: room.disabled } : r)))
      setError("Failed to update disabled status")
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(room.id)
        return next
      })
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const room = deleteTarget
    setDeleteTarget(null)
    const prevList = localRooms
    setLocalRooms((prev) => prev.filter((r) => r.id !== room.id))
    try {
      const res = await fetch(`/api/venues/${venueSlug}/rooms/${room.id}`, { method: "DELETE" })
      if (!res.ok) {
        setLocalRooms(prevList)
        setError(await describeError(res, "Failed to delete room"))
        return
      }
      setSuccess("Room deleted")
    } catch {
      setLocalRooms(prevList)
      setError("Failed to delete room")
    }
  }

  return (
    <div style={{ minWidth: 0 }}>
      {error && (
        <Alert className="mb-4 bg-destructive/10 border-destructive/20">
          <AlertDescription className="text-destructive">{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="mb-4 bg-emerald-500/10 border-emerald-500/20">
          <AlertDescription className="text-emerald-400">{success}</AlertDescription>
        </Alert>
      )}

      <div className="panel rooms-table-scroll" style={{ overflowX: "auto" }}>
        <DataTable
          columns={[
            { label: "Image", hideOnMobile: true },
            { label: "Room" },
            { label: "Room #", hideOnMobile: true },
            { label: "Status" },
            { label: "Owner" },
            { label: "Note" },
            { label: "Last updated by", hideOnMobile: true },
            { label: "" },
          ]}
          isEmpty={localRooms.length === 0}
          emptyMessage={notConnected ? NOT_CONNECTED_MESSAGE : "No rooms yet."}
        >
          {localRooms.map((room) => {
            const status = statusBadge(room.status)
            const image = room.images?.[0]?.image_url ?? null
            return (
              <tr key={room.id}>
                <td className="hide">
                  {image ? (
                    <img
                      src={image}
                      alt={room.name ?? "Room"}
                      style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4 }}
                    />
                  ) : null}
                </td>
                <td className="t-name">
                  {renamingId === room.id ? (
                    <div style={{ display: "flex", gap: 4 }}>
                      <Input
                        type="text"
                        value={renameInput}
                        onChange={(e) => setRenameInput(e.target.value)}
                        style={{ width: 140 }}
                        autoFocus
                      />
                      <Button type="button" size="sm" variant="outline" onClick={() => saveRename(room)}>
                        Save
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setRenamingId(null)
                          setRenameInput("")
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      {room.name ?? "Unnamed room"}
                      {room.room_number != null && (
                        <span className="t-muted sm:hidden" style={{ marginLeft: 6, fontSize: "0.75rem" }}>
                          #{room.room_number}
                        </span>
                      )}
                    </>
                  )}
                </td>
                <td className="hide">
                  {canManage ? (
                    editingRoomNumberId === room.id ? (
                      <div style={{ display: "flex", gap: 4 }}>
                        <Input
                          type="number"
                          min={0}
                          max={999}
                          value={roomNumberInput}
                          onChange={(e) => setRoomNumberInput(e.target.value)}
                          placeholder="—"
                          style={{ width: 60 }}
                          autoFocus
                        />
                        <Button type="button" size="sm" variant="outline" onClick={() => saveRoomNumber(room)}>
                          Save
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingRoomNumberId(null)
                            setRoomNumberInput("")
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <span
                        onClick={() => {
                          setEditingRoomNumberId(room.id)
                          setRoomNumberInput(room.room_number?.toString() ?? "")
                        }}
                        style={{ cursor: "pointer" }}
                        className={room.room_number != null ? "" : "t-muted"}
                      >
                        {room.room_number != null ? `#${room.room_number}` : "Set #…"}
                      </span>
                    )
                  ) : (
                    <span className="t-muted">{room.room_number != null ? `#${room.room_number}` : "—"}</span>
                  )}
                </td>
                <td>
                  <span className={`tag ${status.className}`}>{status.label}</span>
                </td>
                <td>
                  {(() => {
                    const label = reserverLabel(room, names)
                    return <span className={label === "—" ? "t-muted" : ""}>{label}</span>
                  })()}
                </td>
                <td>
                  {editingNoteId === room.id ? (
                    <div style={{ display: "flex", gap: 4 }}>
                      <Input
                        type="text"
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        placeholder="Note…"
                        style={{ width: 160 }}
                        autoFocus
                      />
                      <Button type="button" size="sm" variant="outline" onClick={() => saveNote(room)}>
                        Save
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingNoteId(null)
                          setNoteInput("")
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <span
                      onClick={() => {
                        setEditingNoteId(room.id)
                        setNoteInput(room.notes ?? "")
                      }}
                      style={{ cursor: "pointer" }}
                      className={room.notes ? "" : "t-muted"}
                    >
                      {room.notes || "Add note…"}
                    </span>
                  )}
                </td>
                <td className="hide t-muted">
                  {room.updated_by_person_id != null ? `Member #${room.updated_by_person_id}` : "—"}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    {room.status === "occupied" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline-blue"
                        disabled={pendingIds.has(room.id)}
                        onClick={() => releaseRoomAction(room)}
                      >
                        Release
                      </Button>
                    )}
                    {room.status === "available" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline-blue"
                        disabled={pendingIds.has(room.id)}
                        onClick={() => reserveRoom(room)}
                      >
                        Reserve
                      </Button>
                    )}
                    {canManage && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant={room.locked ? "outline" : "ghost"}
                          disabled={pendingIds.has(room.id)}
                          onClick={() => toggleLocked(room)}
                        >
                          {room.locked ? "Unlock" : "Lock"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={room.disabled ? "outline" : "ghost"}
                          disabled={pendingIds.has(room.id)}
                          onClick={() => toggleDisabled(room)}
                        >
                          {room.disabled ? "Enable" : "Disable"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setRenamingId(room.id)
                            setRenameInput(room.name ?? "")
                          }}
                        >
                          Rename
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => setDeleteTarget(room)}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </DataTable>
      </div>

      {canManage && (
        <div className="panel mt-4 p-4 flex items-center gap-3">
          <Input
            type="text"
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            placeholder="New room name…"
            className="max-w-[240px]"
            onKeyDown={(e) => e.key === "Enter" && addRoom()}
          />
          <Button type="button" size="sm" disabled={!newRoomName.trim() || adding} onClick={addRoom}>
            {adding ? "Adding…" : "Add Room"}
          </Button>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{deleteTarget?.name ?? "this room"}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
