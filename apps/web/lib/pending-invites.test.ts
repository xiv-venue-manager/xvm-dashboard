import { describe, it, expect } from "vitest"
import type { InviteRow } from "@/lib/api/xvm-api"
import { toPendingInviteShape } from "./pending-invites"

const row = (over: Partial<InviteRow> = {}, discordId: string | null = "123456789012345678"): InviteRow => ({
  id: 5,
  person: { id: 1, display_name: "Heir", discord_id: discordId },
  tier: "staff",
  expires_at: "2026-10-01T00:00:00Z",
  invited_by_person_id: 2,
  ...over,
})

describe("toPendingInviteShape", () => {
  it("maps a plain pending invite with no decline or failure", () => {
    const shape = toPendingInviteShape(row())
    expect(shape).toMatchObject({
      id: 5,
      role: "STAFF",
      invitedName: "Heir",
      declinedAt: null,
      declineReason: null,
      dmFailedAt: null,
      dmFailure: null,
      canSendByDm: true,
    })
    expect(shape.inviteExpiresAt?.toISOString()).toBe("2026-10-01T00:00:00.000Z")
  })

  it("carries the decline and its reason", () => {
    const shape = toPendingInviteShape(row({ declined_at: "2026-09-24T10:00:00Z", decline_reason: "busy this week" }))
    expect(shape.declinedAt).toBe("2026-09-24T10:00:00Z")
    expect(shape.declineReason).toBe("busy this week")
  })

  it("carries the failed delivery and its reason", () => {
    const shape = toPendingInviteShape(row({ dm_failed_at: "2026-09-24T11:00:00Z", dm_failure: "Their DMs are closed to me." }))
    expect(shape.dmFailedAt).toBe("2026-09-24T11:00:00Z")
    expect(shape.dmFailure).toBe("Their DMs are closed to me.")
  })

  it("treats fields an older API does not send as absent", () => {
    const shape = toPendingInviteShape(row())
    expect(shape.declinedAt).toBeNull()
    expect(shape.dmFailure).toBeNull()
  })

  it("cannot be sent by DM when the invitee has no Discord account", () => {
    expect(toPendingInviteShape(row({}, null)).canSendByDm).toBe(false)
  })
})
