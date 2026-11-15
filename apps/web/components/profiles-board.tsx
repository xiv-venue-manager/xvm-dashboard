"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PillToggle } from "@/components/pill-toggle"
import { ProfileEditor } from "@/components/profile-editor"
import { ProfileSummary } from "@/components/profile-summary"
import { useResolvedMembers } from "@/components/discord-members"
import { toast } from "sonner"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import { memberLabel } from "@/lib/discord-member-state"
import { PROFILE_LIMITS } from "@/lib/profiles"
import type { ProfileRow } from "@/lib/api/xvm-api"

type View = "mine" | "queue" | "all" | "settings"

export interface ProfilesBoardProps {
  venueId: string
  canManage: boolean
  mine: ProfileRow[]
  all: ProfileRow[]
  approvalRequired: boolean
}

export function ProfilesBoard({ venueId, canManage, mine: initialMine, all: initialAll, approvalRequired: initialApproval }: ProfilesBoardProps) {
  const [view, setView] = useState<View>("mine")
  const [mine, setMine] = useState(initialMine)
  const [all, setAll] = useState(initialAll)
  const [approvalRequired, setApprovalRequired] = useState(initialApproval)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState("")
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProfileRow | null>(null)
  const [rejectTarget, setRejectTarget] = useState<ProfileRow | null>(null)
  const [reason, setReason] = useState("")
  const [savingSetting, setSavingSetting] = useState(false)
  const members = useResolvedMembers(venueId, all.map((p) => p.owner_discord_id ?? ""))

  const pending = all.filter((p) => p.status === "pending")
  const views: ReadonlyArray<{ id: View; label: string }> = canManage
    ? [
        { id: "mine", label: "My sheets" },
        { id: "queue", label: `Review queue (${pending.length})` },
        { id: "all", label: "All sheets" },
        { id: "settings", label: "Settings" },
      ]
    : [{ id: "mine", label: "My sheets" }]

  function upsert(profile: ProfileRow) {
    setMine((prev) => prev.map((p) => (p.id === profile.id ? profile : p)))
    setAll((prev) => prev.map((p) => (p.id === profile.id ? profile : p)))
  }

  function ownerOf(profile: ProfileRow) {
    const id = profile.owner_discord_id ?? ""
    const member = id ? members[id] : undefined
    return { label: id ? memberLabel(id, member) : `Person ${profile.person_id}`, avatarUrl: member?.avatarUrl }
  }

  async function create() {
    if (name.trim() === "") {
      toast.error("Give the character a name.")
      return
    }
    setCreating(true)
    try {
      const created = await apiRoute<ProfileRow>("/api/venues/[venueId]/profiles", {
        params: { venueId },
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterName: name.trim() }),
      })
      setMine((prev) => [...prev, created])
      if (canManage) setAll((prev) => [...prev, created])
      setName("")
      setEditingId(created.id)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to create the sheet.")
    } finally {
      setCreating(false)
    }
  }

  async function approve(profile: ProfileRow) {
    setBusyId(profile.id)
    try {
      upsert(await apiRoute<ProfileRow>("/api/venues/[venueId]/profiles/[profileId]/approve", { params: { venueId, profileId: profile.id }, method: "POST" }))
      toast.success(`${profile.character_name} approved.`)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to approve the sheet.")
    } finally {
      setBusyId(null)
    }
  }

  async function reject() {
    if (!rejectTarget) return
    if (reason.trim() === "") {
      toast.error("Say why it is being sent back.")
      return
    }
    setBusyId(rejectTarget.id)
    try {
      upsert(
        await apiRoute<ProfileRow>("/api/venues/[venueId]/profiles/[profileId]/reject", {
          params: { venueId, profileId: rejectTarget.id },
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason.trim() }),
        })
      )
      toast.success(`${rejectTarget.character_name} sent back.`)
      setRejectTarget(null)
      setReason("")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to reject the sheet.")
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusyId(deleteTarget.id)
    try {
      await apiRoute("/api/venues/[venueId]/profiles/[profileId]", { params: { venueId, profileId: deleteTarget.id }, method: "DELETE" })
      setMine((prev) => prev.filter((p) => p.id !== deleteTarget.id))
      setAll((prev) => prev.filter((p) => p.id !== deleteTarget.id))
      toast.success("Sheet deleted.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to delete the sheet.")
    } finally {
      setBusyId(null)
      setDeleteTarget(null)
    }
  }

  async function toggleApproval(next: boolean) {
    const before = approvalRequired
    setApprovalRequired(next)
    setSavingSetting(true)
    try {
      await apiRoute("/api/venues/[venueId]/profile-settings", {
        params: { venueId },
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalRequired: next }),
      })
    } catch (e) {
      setApprovalRequired(before)
      toast.error(e instanceof ApiError ? e.message : "Failed to save the setting.")
    } finally {
      setSavingSetting(false)
    }
  }

  const editing = mine.find((p) => p.id === editingId) ?? null
  if (editing) {
    return (
      <ProfileEditor
        key={editing.id}
        venueId={venueId}
        profile={editing}
        approvalRequired={approvalRequired}
        onChange={upsert}
        onClose={() => setEditingId(null)}
      />
    )
  }

  return (
    <div className="space-y-4">
      {canManage && <PillToggle label="Profiles view" options={views} value={view} onChange={setView} />}

      {view === "mine" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-3 p-5">
              <Input
                aria-label="New character name"
                placeholder="Name of a new character"
                value={name}
                maxLength={PROFILE_LIMITS.characterName}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !creating && create()}
                disabled={creating}
                className="max-w-xs"
              />
              <Button onClick={create} disabled={creating}>
                {creating ? "Creating..." : "New sheet"}
              </Button>
              <span className="text-xs text-muted-foreground">Up to 10 sheets.</span>
            </CardContent>
          </Card>
          {mine.length === 0 ? (
            <p className="text-sm text-muted-foreground">You have no character sheets yet.</p>
          ) : (
            <div className="space-y-3">
              {mine.map((profile) => (
                <Card key={profile.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                    <div className="min-w-[12rem] flex-1">
                      <ProfileSummary profile={profile} />
                      {profile.status === "rejected" && profile.rejection_reason && (
                        <p className="mt-2 text-sm text-destructive">Rejected: {profile.rejection_reason}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline-blue" onClick={() => setEditingId(profile.id)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" disabled={busyId === profile.id} onClick={() => setDeleteTarget(profile)}>
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {canManage && view === "queue" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Sheets waiting for review. Managers approve or send back; they do not edit a sheet.</p>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing is waiting.</p>
          ) : (
            pending.map((profile) => {
              const owner = ownerOf(profile)
              return (
                <Card key={profile.id}>
                  <CardContent className="space-y-4 p-5">
                    <ProfileSummary profile={profile} ownerLabel={owner.label} ownerAvatarUrl={owner.avatarUrl} detailed />
                    <div className="flex gap-2">
                      <Button size="sm" disabled={busyId === profile.id} onClick={() => approve(profile)}>
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" disabled={busyId === profile.id} onClick={() => setRejectTarget(profile)}>
                        Send back
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      )}

      {canManage && view === "all" && (
        <div className="space-y-3">
          {all.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one has made a sheet yet.</p>
          ) : (
            all.map((profile) => {
              const owner = ownerOf(profile)
              return (
                <Card key={profile.id}>
                  <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5">
                    <div className="min-w-[12rem] flex-1">
                      <ProfileSummary profile={profile} ownerLabel={owner.label} ownerAvatarUrl={owner.avatarUrl} detailed />
                    </div>
                    <Button size="sm" variant="outline" disabled={busyId === profile.id} onClick={() => setDeleteTarget(profile)}>
                      Delete
                    </Button>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      )}

      {canManage && view === "settings" && (
        <Card>
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <div>
              <Label htmlFor="profile-approval" className="text-sm font-medium">
                Sheets need approval before they are posted
              </Label>
              <p className="text-xs text-muted-foreground">When on, a member submits a sheet and a manager approves it first.</p>
            </div>
            <Switch id="profile-approval" checked={approvalRequired} onCheckedChange={toggleApproval} disabled={savingSetting} />
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.character_name ?? "this sheet"}?</AlertDialogTitle>
            <AlertDialogDescription>The sheet, its images and any card the bot posted are deleted. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={busyId !== null}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send {rejectTarget?.character_name ?? "this sheet"} back</DialogTitle>
            <DialogDescription>The owner sees your reason and can edit and submit the sheet again.</DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="Reason"
            rows={4}
            maxLength={PROFILE_LIMITS.reason}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busyId !== null}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)} disabled={busyId !== null}>
              Cancel
            </Button>
            <Button onClick={reject} disabled={busyId !== null}>
              Send back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
