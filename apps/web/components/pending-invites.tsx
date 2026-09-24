"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import { Check, Copy, Send, Trash2 } from "lucide-react"
import { LocalTime } from "@/components/server-time"
import type { PendingInviteShape } from "@/lib/pending-invites"

interface PendingInvitesProps {
  invites: PendingInviteShape[]
  slug: string
  canManageStaff: boolean
}

export function PendingInvites({ invites, slug, canManageStaff }: PendingInvitesProps) {
  const [pendingInvites, setPendingInvites] = useState(invites)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [sendingId, setSendingId] = useState<number | null>(null)
  const [queuedIds, setQueuedIds] = useState<Set<number>>(new Set())
  const [sendError, setSendError] = useState<{ id: number; message: string } | null>(null)

  const getInviteUrl = (token: string) => {
    if (typeof window === "undefined") return ""
    return `${window.location.origin}/invite/${token}`
  }

  const copyInviteLink = async (invite: PendingInviteShape) => {
    if (!invite.inviteToken) return

    const url = getInviteUrl(invite.inviteToken)
    await navigator.clipboard.writeText(url)
    setCopiedId(invite.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const sendByDm = async (inviteId: number) => {
    setSendingId(inviteId)
    setSendError(null)
    try {
      const venueResponse = await fetch(`/api/venues?slug=${slug}`)
      const venues = await venueResponse.json()
      const venue = venues.find((v: { slug: string }) => v.slug === slug)

      const response = await fetch(`/api/venues/${venue.id}/staff/invites/${inviteId}/send`, { method: "POST" })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || data.error || "Failed to send invite")
      }

      setQueuedIds((prev) => new Set(prev).add(inviteId))
      setPendingInvites((prev) =>
        prev.map((inv) => (inv.id === inviteId ? { ...inv, dmFailedAt: null, dmFailure: null } : inv))
      )
    } catch (error: unknown) {
      setSendError({ id: inviteId, message: error instanceof Error ? error.message : "Failed to send invite" })
    } finally {
      setSendingId(null)
    }
  }

  const deleteInvite = async (inviteId: number) => {
    setDeletingId(inviteId)
    try {
      // Get venue ID first
      const venueResponse = await fetch(`/api/venues?slug=${slug}`)
      const venues = await venueResponse.json()
      const venue = venues.find((v: { slug: string }) => v.slug === slug)

      const response = await fetch(`/api/venues/${venue.id}/staff/invites/${inviteId}`, {
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
                    <p className="text-xs text-muted-foreground mt-1">
                      Expires:{" "}
                      {invite.inviteExpiresAt ? (
                        <LocalTime date={invite.inviteExpiresAt} formatStr="datelong" />
                      ) : (
                        "Never"
                      )}
                    </p>

                    {invite.declinedAt && (
                      <p className="text-xs text-muted-foreground mt-2">
                        <span className="font-medium text-foreground">Declined</span>{" "}
                        <LocalTime date={new Date(invite.declinedAt)} formatStr="datelong" />
                        {invite.declineReason ? `: "${invite.declineReason}"` : ""}. They can still accept until the invite
                        expires.
                      </p>
                    )}
                    {invite.dmFailedAt && (
                      <p className="text-xs text-amber-400 mt-2">
                        Couldn&apos;t DM: {invite.dmFailure || "delivery failed"}
                      </p>
                    )}
                    {queuedIds.has(invite.id) && (
                      <p className="text-xs text-muted-foreground mt-2">
                        DM queued. You&apos;ll be told on Discord if it can&apos;t be delivered.
                      </p>
                    )}
                    {sendError?.id === invite.id && (
                      <p className="text-xs text-destructive mt-2">{sendError.message}</p>
                    )}

                    {/* Invite Link */}
                    {invite.inviteToken && (
                      <div className="mt-3">
                        <p className="text-xs font-medium mb-1 text-muted-foreground">Invite Link:</p>
                        <div className="flex items-center gap-2 min-w-0">
                          <code className="text-xs bg-[rgba(0,180,255,0.08)] text-[var(--xiv-blue)] px-2 py-1 rounded flex-1 truncate min-w-0 border border-[rgba(0,180,255,0.15)]">
                            {getInviteUrl(invite.inviteToken)}
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
                    <Badge variant="outline">{invite.declinedAt ? "Declined" : "Pending"}</Badge>
                  </div>

                  {canManageStaff && (
                    <div className="flex gap-2">
                      {invite.canSendByDm && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => sendByDm(invite.id)}
                          disabled={sendingId === invite.id}
                        >
                          <Send className="h-4 w-4 mr-1" />
                          {invite.dmFailedAt ? "Try again" : "Send via Discord"}
                        </Button>
                      )}
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
    </div>
  )
}
