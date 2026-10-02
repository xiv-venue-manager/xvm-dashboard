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

export type RoomItem = {
  id: string
  name: string
  isOccupied: boolean
  note: string | null
  updatedByName: string | null
  locked: boolean
  disabled: boolean
  roomNumber: number | null
  imageUrl: string | null
  ownerDiscordId: string | null
}

interface GuildMember {
  id: string
  username: string
  display_name?: string
  avatar?: string
}

function derivedStatus(room: RoomItem): { label: string; className: string } {
  if (room.disabled) return { label: "Disabled", className: "neutral" }
  if (room.locked) return { label: "Locked", className: "warning" }
  if (room.isOccupied) return { label: "Occupied", className: "danger" }
  return { label: "Available", className: "vip" }
}

export function RoomsBoard({ venueId, canManage, rooms, froggeConnected }: { venueId: string; canManage: boolean; rooms: RoomItem[]; froggeConnected?: boolean }) {
  const [localRooms, setLocalRooms] = useState(rooms)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteInput, setNoteInput] = useState("")
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameInput, setRenameInput] = useState("")
  const [newRoomName, setNewRoomName] = useState("")
  const [adding, setAdding] = useState(false)
  const [editingRoomNumberId, setEditingRoomNumberId] = useState<string | null>(null)
  const [roomNumberInput, setRoomNumberInput] = useState("")
  const [uploadingImageId, setUploadingImageId] = useState<string | null>(null)
  const [postingDiscord, setPostingDiscord] = useState(false)
  const [members, setMembers] = useState<GuildMember[]>([])
  const [membersLoaded, setMembersLoaded] = useState(false)
  const [editingOwnerId, setEditingOwnerId] = useState<string | null>(null)
  const [ownerSearch, setOwnerSearch] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RoomItem | null>(null)

  useEffect(() => {
    if (!froggeConnected || membersLoaded) return
    fetch(`/api/venues/${venueId}/frogge/members`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: GuildMember[]) => {
        setMembers(data)
        setMembersLoaded(true)
      })
      .catch(() => setMembersLoaded(true))
  }, [froggeConnected, membersLoaded, venueId])

  useEffect(() => {
    const es = new EventSource("/api/stream/" + venueId)
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type !== "room_status") return
        setLocalRooms((prev) =>
          prev.map((r) =>
            r.id === msg.data.roomId
              ? { ...r, isOccupied: msg.data.isOccupied, note: msg.data.note, updatedByName: msg.data.updatedByName }
              : r
          )
        )
      } catch {}
    }
    return () => es.close()
  }, [venueId])

  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null)
        setSuccess(null)
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [error, success])

  async function toggleStatus(room: RoomItem) {
    if (pendingIds.has(room.id)) return
    const nextOccupied = !room.isOccupied
    setPendingIds((prev) => new Set(prev).add(room.id))
    setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, isOccupied: nextOccupied, note: nextOccupied ? r.note : null } : r)))
    try {
      const res = await fetch(`/api/venues/${venueId}/rooms/${room.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOccupied: nextOccupied, note: nextOccupied ? room.note ?? "" : "" }),
      })
      if (!res.ok) throw new Error("request failed")
      const updated = await res.json()
      setLocalRooms((prev) =>
        prev.map((r) => (r.id === room.id ? { ...r, isOccupied: updated.isOccupied, note: updated.note } : r))
      )
    } catch {
      setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, isOccupied: room.isOccupied } : r)))
      setError("Failed to update room status")
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
    setPendingIds((prev) => new Set(prev).add(room.id))
    const prevNote = room.note
    setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, note: trimmed || null } : r)))
    try {
      const res = await fetch(`/api/venues/${venueId}/rooms/${room.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOccupied: room.isOccupied, note: trimmed }),
      })
      if (!res.ok) throw new Error("request failed")
      const updated = await res.json()
      setLocalRooms((prev) =>
        prev.map((r) => (r.id === room.id ? { ...r, isOccupied: updated.isOccupied, note: updated.note } : r))
      )
    } catch {
      setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, note: prevNote } : r)))
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
      const res = await fetch(`/api/venues/${venueId}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || "Failed to add room")
        return
      }
      const created = await res.json()
      setLocalRooms((prev) => [
        ...prev,
        {
          id: created.id,
          name: created.name,
          isOccupied: false,
          note: null,
          updatedByName: null,
          locked: false,
          disabled: false,
          roomNumber: null,
          imageUrl: null,
          ownerDiscordId: null,
        },
      ])
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
      const res = await fetch(`/api/venues/${venueId}/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error("request failed")
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
    if (roomNumber === room.roomNumber) return
    setPendingIds((prev) => new Set(prev).add(room.id))
    const prevNumber = room.roomNumber
    setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, roomNumber } : r)))
    try {
      const res = await fetch(`/api/venues/${venueId}/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomNumber }),
      })
      if (!res.ok) throw new Error("request failed")
    } catch {
      setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, roomNumber: prevNumber } : r)))
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
      const res = await fetch(`/api/venues/${venueId}/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked: nextLocked }),
      })
      if (!res.ok) throw new Error("request failed")
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
      const res = await fetch(`/api/venues/${venueId}/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: nextDisabled }),
      })
      if (!res.ok) throw new Error("request failed")
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

  async function uploadRoomImage(room: RoomItem, file: File) {
    if (pendingIds.has(room.id)) return
    setPendingIds((prev) => new Set(prev).add(room.id))
    setUploadingImageId(room.id)
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || "Failed to get upload URL")
      }
      const { uploadUrl, storedUrl } = await res.json()
      const put = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } })
      if (!put.ok) throw new Error("Upload failed")
      const patch = await fetch(`/api/venues/${venueId}/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: storedUrl }),
      })
      if (!patch.ok) throw new Error("Failed to save image")
      setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, imageUrl: storedUrl } : r)))
      setSuccess("Image uploaded")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload image")
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(room.id)
        return next
      })
      setUploadingImageId(null)
    }
  }

  async function postToDiscord() {
    setPostingDiscord(true)
    setError(null)
    try {
      const res = await fetch(`/api/venues/${venueId}/rooms/post`, { method: "POST" })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Failed to post")
      }
      setSuccess("Rooms posted to Discord")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to post rooms")
    } finally {
      setPostingDiscord(false)
    }
  }

  async function saveOwner(room: RoomItem, discordId: string | null) {
    if (pendingIds.has(room.id)) return
    setPendingIds((prev) => new Set(prev).add(room.id))
    const prevOwner = room.ownerDiscordId
    setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, ownerDiscordId: discordId } : r)))
    setEditingOwnerId(null)
    setOwnerSearch("")
    try {
      const res = await fetch(`/api/venues/${venueId}/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerDiscordId: discordId }),
      })
      if (!res.ok) throw new Error("Failed to update owner")
    } catch {
      setLocalRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, ownerDiscordId: prevOwner } : r)))
      setError("Failed to update owner")
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
      const res = await fetch(`/api/venues/${venueId}/rooms/${room.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("request failed")
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
          emptyMessage="No rooms yet."
        >
          {localRooms.map((room) => (
            <tr key={room.id}>
              <td className="hide">
                {room.imageUrl ? (
                  <img
                    src={room.imageUrl}
                    alt={room.name}
                    style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4 }}
                  />
                ) : canManage ? (
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 48,
                      height: 48,
                      border: "1px dashed var(--xiv-border)",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontSize: "0.7rem",
                      color: "var(--xiv-subtext0)",
                    }}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      disabled={uploadingImageId === room.id}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) uploadRoomImage(room, file)
                      }}
                    />
                    {uploadingImageId === room.id ? "..." : "+"}
                  </label>
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
                    {room.name}
                    {room.roomNumber != null && (
                      <span className="t-muted" style={{ marginLeft: 6, fontSize: "0.75rem" }}>
                        #{room.roomNumber}
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
                        setRoomNumberInput(room.roomNumber?.toString() ?? "")
                      }}
                      style={{ cursor: "pointer" }}
                      className={room.roomNumber != null ? "" : "t-muted"}
                    >
                      {room.roomNumber != null ? `#${room.roomNumber}` : "Set #…"}
                    </span>
                  )
                ) : (
                  <span className="t-muted">{room.roomNumber != null ? `#${room.roomNumber}` : "—"}</span>
                )}
              </td>
              <td>
                {(() => {
                  const status = derivedStatus(room)
                  return (
                    <span className={`tag ${status.className}`}>{status.label}</span>
                  )
                })()}
              </td>
              <td>
                {froggeConnected && canManage ? (
                  editingOwnerId === room.id ? (
                    <div style={{ position: "relative", width: 200 }}>
                      <Input
                        type="text"
                        value={ownerSearch}
                        onChange={(e) => setOwnerSearch(e.target.value)}
                        placeholder="Search member…"
                        autoFocus
                        style={{ width: "100%" }}
                      />
                      {ownerSearch.length > 0 && (
                        <div
                          style={{
                            position: "absolute",
                            top: "100%",
                            left: 0,
                            right: 0,
                            zIndex: 50,
                            marginTop: 4,
                            maxHeight: 200,
                            overflowY: "auto",
                            background: "rgba(10,15,30,0.97)",
                            backdropFilter: "blur(20px)",
                            border: "1px solid var(--blue-018)",
                            borderRadius: 8,
                            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
                          }}
                        >
                          {members
                            .filter((m) =>
                              m.username.toLowerCase().includes(ownerSearch.toLowerCase()) ||
                              (m.display_name ?? "").toLowerCase().includes(ownerSearch.toLowerCase())
                            )
                            .slice(0, 10)
                            .map((m) => (
                              <div
                                key={m.id}
                                onClick={() => saveOwner(room, m.id)}
                                style={{
                                  padding: "8px 12px",
                                  cursor: "pointer",
                                  fontSize: "0.85rem",
                                  borderBottom: "1px solid var(--blue-008)",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--blue-007)")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                              >
                                {m.display_name ?? m.username}
                              </div>
                            ))}
                          {members.filter((m) =>
                            m.username.toLowerCase().includes(ownerSearch.toLowerCase()) ||
                            (m.display_name ?? "").toLowerCase().includes(ownerSearch.toLowerCase())
                          ).length === 0 && (
                            <div style={{ padding: "8px 12px", fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
                              No members found
                            </div>
                          )}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const member = members.find((m) => m.id === ownerSearch)
                            saveOwner(room, member?.id ?? null)
                          }}
                        >
                          Save
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingOwnerId(null)
                            setOwnerSearch("")
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <span
                      onClick={() => {
                        setEditingOwnerId(room.id)
                        setOwnerSearch(room.ownerDiscordId ?? "")
                      }}
                      style={{ cursor: "pointer" }}
                      className={room.ownerDiscordId ? "" : "t-muted"}
                    >
                      {members.find((m) => m.id === room.ownerDiscordId)?.display_name ?? room.ownerDiscordId ?? "Set owner…"}
                    </span>
                  )
                ) : room.ownerDiscordId ? (
                  <span>{members.find((m) => m.id === room.ownerDiscordId)?.display_name ?? room.ownerDiscordId}</span>
                ) : (
                  <span className="t-muted">—</span>
                )}
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
                      setNoteInput(room.note ?? "")
                    }}
                    style={{ cursor: "pointer" }}
                    className={room.note ? "" : "t-muted"}
                  >
                    {room.note || "Add note…"}
                  </span>
                )}
              </td>
              <td className="hide t-muted">{room.updatedByName ?? "—"}</td>
              <td>
                <div style={{ display: "flex", gap: 6 }}>
                  {room.isOccupied && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline-blue"
                      disabled={pendingIds.has(room.id)}
                      onClick={() => toggleStatus(room)}
                    >
                      Release
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
                          setRenameInput(room.name)
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
          ))}
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
          {froggeConnected && (
            <Button
              type="button"
              size="sm"
              variant="outline-blue"
              disabled
              onClick={postToDiscord}
              title="Posting rooms to Discord isn't available yet"
              className="ml-auto"
            >
              {postingDiscord ? "Posting…" : "Post to Discord (coming soon)"}
            </Button>
          )}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
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
