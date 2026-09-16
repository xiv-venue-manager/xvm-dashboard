"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { RoleBadge } from "@/components/role-badge"
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
    <div>
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <span className="text-muted-foreground">Former Staff</span>
      </h2>
      {error && <p className="text-sm text-destructive mb-3">{error}</p>}
      <div className="grid grid-cols-1 gap-4">
        {formerMembers.map((member) => {
          const displayName = resolveDisplayName({
            characterName: member.user?.characterName,
            nickname: member.nickname,
            displayName: member.user?.displayName,
            discordName: member.user?.name,
          })

          return (
            <Card key={member.id} className="border-muted opacity-80">
              <CardContent className="p-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-muted text-muted-foreground">
                        {displayName.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{displayName}</p>
                      <RoleBadge role={member.role} className="mt-1" />
                    </div>
                  </div>

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
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
