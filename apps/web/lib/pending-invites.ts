import type { InviteRow } from "@/lib/api/xvm-api"

export type PendingInviteShape = {
  id: number
  role: string
  invitedName: string | null
  inviteToken: string | null
  inviteExpiresAt: Date | null
  declinedAt: string | null
  declineReason: string | null
  dmFailedAt: string | null
  dmFailure: string | null
  canSendByDm: boolean
}

// list_invites returns no token (xvm-api only ever hands one out once, at
// creation) - the "Invite Link" section in PendingInvites just won't render
// for these, gracefully, via its existing invite.inviteToken guard.
export function toPendingInviteShape(invite: InviteRow): PendingInviteShape {
  return {
    id: invite.id,
    role: invite.tier.toUpperCase(),
    invitedName: invite.person.display_name,
    inviteToken: null,
    inviteExpiresAt: new Date(invite.expires_at),
    declinedAt: invite.declined_at ?? null,
    declineReason: invite.decline_reason ?? null,
    dmFailedAt: invite.dm_failed_at ?? null,
    dmFailure: invite.dm_failure ?? null,
    canSendByDm: invite.person.discord_id !== null,
  }
}
