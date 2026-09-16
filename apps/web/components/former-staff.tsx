"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
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
import { UserCheck } from "lucide-react"
import { resolveDisplayName } from "@/lib/display-name"
import type { StaffMember } from "@/components/staff-table"

// Matches staff-table.tsx's rolePill exactly - duplicated per this
// codebase's per-file convention rather than exported/shared.
const rolePill: Record<string, string> = {
  OWNER: "bg-[rgba(249,226,175,0.10)] text-[var(--warning)] border border-[rgba(249,226,175,0.28)]",
  MANAGER: "bg-[rgba(0,180,255,0.10)] text-[var(--xiv-blue)] border border-[rgba(0,180,255,0.28)]",
  STAFF: "bg-[rgba(108,112,134,0.12)] text-muted-foreground border border-[var(--border)]",
}

interface FormerStaffProps {
  members: StaffMember[]
  slug: string
  canManageStaff: boolean
}

export function FormerStaff({ members, slug, canManageStaff }: FormerStaffProps) {
  const router = useRouter()
  const [formerMembers, setFormerMembers] = useState(members)
  const [rehiringId, setRehiringId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rehire = async (memberId: number) => {
    setRehiringId(memberId)
    setError(null)
    try {
      const response = await fetch(`/api/venues/${slug}/staff/${memberId}/rehire`, {
        method: "POST",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to rehire staff member")
      }

      setFormerMembers((prev) => prev.filter((m) => m.id !== memberId))
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to rehire staff member")
    } finally {
      setRehiringId(null)
    }
  }

  if (formerMembers.length === 0) {
    return null
  }

  return (
    <section className="panel">
      <div className="ph">
        <span className="pt">
          <UserCheck /> Former Staff
        </span>
        <span className="ph-spacer" />
        <span className="pcount">
          {formerMembers.length} {formerMembers.length === 1 ? "member" : "members"}
        </span>
      </div>
      {error && <p className="px-5 pt-3 text-xs text-destructive">{error}</p>}
      <table className="dtable">
        <tbody>
          {formerMembers.map((member) => {
            const displayName = resolveDisplayName({
              characterName: member.user?.characterName,
              nickname: member.nickname,
              displayName: member.user?.displayName,
              discordName: member.user?.name,
            })

            return (
              <tr key={member.id}>
                <td className="w-[300px]">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-8 h-8 flex-shrink-0">
                      <AvatarFallback className="text-[0.65rem] font-bold bg-muted text-muted-foreground">
                        {displayName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{displayName}</span>
                  </div>
                </td>
                <td>
                  <span className={`text-[0.7rem] font-medium px-2.5 py-0.5 rounded-full ${rolePill[member.role]}`}>
                    {member.role.charAt(0) + member.role.slice(1).toLowerCase()}
                  </span>
                </td>
                <td className="t-num">
                  {canManageStaff && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" disabled={rehiringId === member.id}>
                          <UserCheck className="h-4 w-4 mr-1" />
                          Rehire
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Rehire {displayName}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Restores them to the active roster at their previous role
                            ({member.role.toLowerCase()}) and positions.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => rehire(member.id)}>Rehire</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
