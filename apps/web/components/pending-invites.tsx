"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Check, Copy, Trash2, Pencil } from "lucide-react"
import { LocalTime } from "@/components/server-time"

interface PendingInvite {
  id: string
  role: string
  invitedName: string | null
  invitedEmail: string | null
  inviteToken: string | null
  inviteExpiresAt: Date | null
  createdAt: Date
}

interface PendingInvitesProps {
  invites: PendingInvite[]
  slug: string
  canManageStaff: boolean
}

export function PendingInvites({ invites, slug, canManageStaff }: PendingInvitesProps) {
  const [pendingInvites, setPendingInvites] = useState(invites)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingInvite, setEditingInvite] = useState<PendingInvite | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editForm, setEditForm] = useState({ name: "", email: "" })
  const [isUpdating, setIsUpdating] = useState(false)
  const [editError, setEditError] = useState("")
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const getInviteUrl = (token: string) => {
    if (typeof window === "undefined") return ""
    return `${window.location.origin}/invite/${token}`
  }

  const copyInviteLink = async (invite: PendingInvite) => {
    if (!invite.inviteToken) return

    const url = getInviteUrl(invite.inviteToken)
    await navigator.clipboard.writeText(url)
    setCopiedId(invite.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const openEditDialog = (invite: PendingInvite) => {
    setEditingInvite(invite)
    setEditForm({
      name: invite.invitedName || "",
      email: invite.invitedEmail || "",
    })
    setEditError("")
    setIsEditDialogOpen(true)
  }

  const updateInvite = async () => {
    if (!editingInvite) return

    setIsUpdating(true)
    setEditError("")

    try {
      // Get venue ID first
      const venueResponse = await fetch(`/api/venues?slug=${slug}`)
      const venues = await venueResponse.json()
      const venue = venues.find((v: { slug: string }) => v.slug === slug)

      const response = await fetch(`/api/venues/${venue.id}/staff/${editingInvite.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invitedName: editForm.name || null,
          invitedEmail: editForm.email || null,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update invite")
      }

      const updatedInvite = await response.json()

      // Update local state
      setPendingInvites((prev) =>
        prev.map((inv) =>
          inv.id === editingInvite.id
            ? {
                ...inv,
                invitedName: updatedInvite.invitedName,
                invitedEmail: updatedInvite.invitedEmail,
              }
            : inv
        )
      )

      setIsEditDialogOpen(false)
      setEditingInvite(null)
    } catch (error: unknown) {
      setEditError(error instanceof Error ? error.message : "Failed to update invite")
    } finally {
      setIsUpdating(false)
    }
  }

  const deleteInvite = async (inviteId: string) => {
    setDeletingId(inviteId)
    try {
      // Get venue ID first
      const venueResponse = await fetch(`/api/venues?slug=${slug}`)
      const venues = await venueResponse.json()
      const venue = venues.find((v: { slug: string }) => v.slug === slug)

      const response = await fetch(`/api/venues/${venue.id}/staff/${inviteId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to delete invite")
      }

      // Remove from local state
      setPendingInvites((prev) => prev.filter((inv) => inv.id !== inviteId))
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "Failed to delete invite")
    } finally {
      setDeletingId(null)
    }
  }

  if (pendingInvites.length === 0) {
    return null
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <span className="text-yellow-400">⏳</span> Pending Invites
      </h2>
      <div className="grid grid-cols-1 gap-4">
        {pendingInvites.map((invite) => (
          <Card key={invite.id} className="border-yellow-400/20">
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 flex-1">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-yellow-400/10 text-yellow-400">
                      {invite.invitedName?.substring(0, 2).toUpperCase() || "??"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{invite.invitedName || "Unnamed Invite"}</p>
                    {invite.invitedEmail && <p className="text-xs text-muted-foreground">{invite.invitedEmail}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      Expires:{" "}
                      {invite.inviteExpiresAt ? (
                        <LocalTime date={invite.inviteExpiresAt} formatStr="datelong" />
                      ) : (
                        "Never"
                      )}
                    </p>

                    {/* Invite Link */}
                    {invite.inviteToken && (
                      <div className="mt-3">
                        <p className="text-xs font-medium mb-1 text-muted-foreground">Invite Link:</p>
                        <div className="flex items-center gap-2 min-w-0">
                          <code className="text-xs bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-2 py-1 rounded flex-1 truncate min-w-0 border border-[rgba(0,180,255,0.15)]">
                            {mounted ? getInviteUrl(invite.inviteToken) : ""}
                          </code>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copyInviteLink(invite)}
                            className="shrink-0"
                          >
                            {copiedId === invite.id ? (
                              <>
                                <Check className="h-4 w-4 mr-1" />
                                Copied!
                              </>
                            ) : (
                              <>
                                <Copy className="h-4 w-4 mr-1" />
                                Copy
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex flex-col gap-2 items-end">
                    <Badge variant="secondary" className="bg-yellow-400/10 text-yellow-400">
                      {invite.role}
                    </Badge>
                    <Badge variant="outline">Pending</Badge>
                  </div>

                  {canManageStaff && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditDialog(invite)}
                        disabled={deletingId === invite.id}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            disabled={deletingId === invite.id}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Invite?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this invite for{" "}
                              <strong>{invite.invitedName || "this person"}</strong>? The invite link will no longer
                              work.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteInvite(invite.id)}
                              className="bg-destructive text-white hover:bg-destructive/90"
                            >
                              Delete Invite
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Invite Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Invite Details</DialogTitle>
            <DialogDescription>
              Update the name and email for this pending invitation. This helps you track who the invite is for.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {editError && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-2 rounded text-sm">
                {editError}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                placeholder="e.g., John Doe"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                disabled={isUpdating}
              />
              <p className="text-xs text-muted-foreground">Optional: Add a name to help identify this invite</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                placeholder="e.g., john@example.com"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                disabled={isUpdating}
              />
              <p className="text-xs text-muted-foreground">
                Optional: Add an email for reference (not used for authentication)
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isUpdating}>
              Cancel
            </Button>
            <Button onClick={updateInvite} disabled={isUpdating}>
              {isUpdating ? "Updating..." : "Update Invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
