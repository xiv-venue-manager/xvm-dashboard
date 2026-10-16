"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { PageLoading } from "@/components/ui/loading-spinner"
import { VenueLayoutClient } from "@/components/venue-layout-client"
import { LocalTime } from "@/components/server-time"

// xvm-api's Position model has no primary/secondary distinction the way
// Prisma's customRole vs additionalRoles did - every assigned position is
// one flat, equally-weighted set (see Position Management below).
interface StaffMember {
  id: number
  role: "OWNER" | "MANAGER" | "STAFF"
  baseRole: "OWNER" | "MANAGER" | "STAFF"
  joinedAt: string | null
  nickname: string | null
  additionalRoles: { id: number; name: string; color: number | null }[]
  user: {
    id: number
    name: string | null
    displayName: string | null
    image: string | null
  } | null
}

interface TierGrant {
  id: number
  tier: string
  granted_at: string
  expires_at: string | null
  granted_by_person_id: number | null
  revoked_at: string | null
  is_live: boolean
}

interface Position {
  id: number
  name: string
  color: string | null
  responsibilities: string | null
}

const roleColors = {
  OWNER: "bg-purple-500",
  MANAGER: "bg-blue-500",
  STAFF: "bg-emerald-500",
}

export default function ManageStaffMemberPage({ params }: { params: Promise<{ slug: string; membershipId: string }> }) {
  const router = useRouter()
  const [slug, setSlug] = useState<string>("")
  const [membershipId, setMembershipId] = useState<string>("")
  const [staffMember, setStaffMember] = useState<StaffMember | null>(null)
  const [positions, setPositions] = useState<Position[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  // Form state
  const [selectedRole, setSelectedRole] = useState<"OWNER" | "MANAGER" | "STAFF">("STAFF")
  const [selectedPositionIds, setSelectedPositionIds] = useState<number[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Tier grants
  const [grants, setGrants] = useState<TierGrant[]>([])
  const [deputiseOpen, setDeputiseOpen] = useState(false)
  const [deputiseExpiresAt, setDeputiseExpiresAt] = useState("")
  const [isDeputising, setIsDeputising] = useState(false)
  const [deputiseError, setDeputiseError] = useState("")
  const [revokingGrantId, setRevokingGrantId] = useState<number | null>(null)

  // Unwrap params
  useEffect(() => {
    params.then((p) => {
      setSlug(p.slug)
      setMembershipId(p.membershipId)
    })
  }, [params])

  // Fetch staff member and positions
  useEffect(() => {
    if (!slug || !membershipId) return

    const fetchData = async () => {
      try {
        setIsLoading(true)
        setError("")

        // The roster route resolves slug-or-id itself, no separate venue lookup needed.
        const staffResponse = await fetch(`/api/venues/${slug}/staff`)
        if (!staffResponse.ok) throw new Error("Failed to fetch staff")

        const staffData: StaffMember[] = await staffResponse.json()
        const targetId = Number(membershipId)
        const member = staffData.find((s) => s.id === targetId)

        if (!member) {
          throw new Error("Staff member not found")
        }

        setStaffMember(member)
        setSelectedRole(member.baseRole)
        setSelectedPositionIds(member.additionalRoles.map((r) => r.id))

        const grantsResponse = await fetch(`/api/venues/${slug}/staff/${membershipId}/tier-grants`)
        if (grantsResponse.ok) {
          setGrants(await grantsResponse.json())
        }

        const positionsResponse = await fetch(`/api/venues/${slug}/roles`)
        if (positionsResponse.ok) {
          const positionsData = await positionsResponse.json()
          setPositions(positionsData)
        }
      } catch (error: unknown) {
        setError(error instanceof Error ? error.message : "Failed to load staff member")
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [slug, membershipId])

  const handleSave = async () => {
    if (!staffMember) return

    setIsSaving(true)
    setError("")
    setSuccess("")

    try {
      const response = await fetch(`/api/venues/${slug}/staff/${membershipId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: selectedRole,
          additionalRoleIds: selectedPositionIds,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update staff member")
      }

      const updatedMember = await response.json()
      if (updatedMember.partial) {
        setError(updatedMember.error || "Some changes were saved, but not all of them.")
      } else {
        setSuccess("Staff member updated successfully!")
      }
      setStaffMember(updatedMember)

      // Refresh after 1.5 seconds
      setTimeout(() => {
        router.refresh()
      }, 1500)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Failed to update staff member")
    } finally {
      setIsSaving(false)
    }
  }

  const handleRemove = async () => {
    if (!staffMember) return

    setIsDeleting(true)
    setError("")

    try {
      const response = await fetch(`/api/venues/${slug}/staff/${membershipId}`, {
        method: "DELETE",
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Failed to remove staff member")
      }

      if (data.partial) {
        // Termination succeeded - only cleanup (tasks/key revocation) failed.
        // Worth a beat for the warning to register before leaving the page.
        setError(data.error || "Removed, but some cleanup steps failed.")
        setTimeout(() => router.push(`/dashboard/${slug}/staff`), 2000)
        return
      }

      router.push(`/dashboard/${slug}/staff`)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Failed to remove staff member")
      setIsDeleting(false)
    }
  }

  const refreshGrants = async () => {
    const response = await fetch(`/api/venues/${slug}/staff/${membershipId}/tier-grants`)
    if (response.ok) {
      setGrants(await response.json())
    }
  }

  const handleDeputise = async () => {
    if (!deputiseExpiresAt) {
      setDeputiseError("Pick an expiry.")
      return
    }
    if (new Date(deputiseExpiresAt) <= new Date()) {
      setDeputiseError("The expiry is already in the past.")
      return
    }

    setIsDeputising(true)
    setDeputiseError("")

    try {
      const response = await fetch(`/api/venues/${slug}/staff/${membershipId}/tier-grants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresAt: new Date(deputiseExpiresAt).toISOString() }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to grant temporary elevation")
      }

      setDeputiseOpen(false)
      setDeputiseExpiresAt("")
      await refreshGrants()
      router.refresh()
    } catch (error: unknown) {
      setDeputiseError(error instanceof Error ? error.message : "Failed to grant temporary elevation")
    } finally {
      setIsDeputising(false)
    }
  }

  const handleRevoke = async (grantId: number) => {
    setRevokingGrantId(grantId)
    setError("")

    try {
      const response = await fetch(`/api/venues/${slug}/staff/${membershipId}/tier-grants/${grantId}/revoke`, {
        method: "POST",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to revoke elevation")
      }

      await refreshGrants()
      router.refresh()
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Failed to revoke elevation")
    } finally {
      setRevokingGrantId(null)
    }
  }

  if (!slug || !membershipId) {
    return (
      <VenueLayoutClient slug={slug}>
        <div className="page-inner">
          <PageLoading />
        </div>
      </VenueLayoutClient>
    )
  }

  if (isLoading) {
    return (
      <VenueLayoutClient slug={slug}>
        <div className="page-inner">
          <PageLoading text="Loading staff member..." />
        </div>
      </VenueLayoutClient>
    )
  }

  if (!staffMember) {
    return (
      <VenueLayoutClient slug={slug}>
        <div className="page-inner">
          <Alert className="bg-destructive/10 border-destructive/20">
            <AlertDescription className="text-destructive">Staff member not found</AlertDescription>
          </Alert>
          <Button asChild className="mt-4">
            <Link href={`/dashboard/${slug}/staff`}>← Back to Staff</Link>
          </Button>
        </div>
      </VenueLayoutClient>
    )
  }

  return (
    <VenueLayoutClient slug={slug}>
      <div className="page-inner max-w-3xl">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-4xl font-bold">Manage Staff Member</h1>
          <p className="text-muted-foreground mt-2">Update roles and permissions for this team member</p>
        </div>

        {/* Success Message */}
        {success && (
          <Alert className="mb-6 bg-emerald-500/10 border-emerald-500/20">
            <AlertDescription className="text-emerald-400">{success}</AlertDescription>
          </Alert>
        )}

        {/* Error Message */}
        {error && (
          <Alert className="mb-6 bg-destructive/10 border-destructive/20">
            <AlertDescription className="text-destructive">{error}</AlertDescription>
          </Alert>
        )}

        {/* Staff Member Info */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Staff Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={staffMember.user?.image || undefined} />
                <AvatarFallback>{staffMember.user?.name?.substring(0, 2).toUpperCase() || "??"}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="text-xl font-semibold">{staffMember.user?.name}</p>
              </div>
              <div>
                <Badge className={roleColors[staffMember.role]}>{staffMember.role}</Badge>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Joined {staffMember.joinedAt ? format(new Date(staffMember.joinedAt), "PPP") : "—"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Role Management */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Role Management</CardTitle>
            <CardDescription>Update this staff member&apos;s base role and assigned positions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Base Role */}
            <div className="space-y-2">
              <Label htmlFor="base-role">Base Role</Label>
              <Select
                value={selectedRole}
                onValueChange={(value: string) => setSelectedRole(value as "OWNER" | "MANAGER" | "STAFF")}
                disabled={isSaving}
              >
                <SelectTrigger id="base-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STAFF">Staff</SelectItem>
                  <SelectItem value="MANAGER">Manager</SelectItem>
                  <SelectItem value="OWNER">Owner</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>
                  <strong>Staff:</strong> Can view events, log sales, view tasks
                </p>
                <p>
                  <strong>Manager:</strong> Can create/edit events, manage tasks, view reports
                </p>
                <p>
                  <strong>Owner:</strong> Full access to all venue features
                </p>
              </div>
            </div>

            {/* Positions */}
            <div className="space-y-2">
              <Label>Positions</Label>
              <p className="text-xs text-muted-foreground">
                Lets this person provide services and fill shifts for these positions.
              </p>
              <div className="flex flex-wrap gap-2">
                {positions.map((position) => {
                  const checked = selectedPositionIds.includes(position.id)
                  return (
                    <button
                      key={position.id}
                      type="button"
                      onClick={() =>
                        setSelectedPositionIds((prev) =>
                          checked ? prev.filter((id) => id !== position.id) : [...prev, position.id]
                        )
                      }
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                        checked
                          ? "border-[var(--xiv-blue)] bg-[rgba(0,180,255,0.12)] text-[var(--xiv-blue)]"
                          : "border-[var(--blue-015)] text-muted-foreground hover:border-[var(--blue-028)]"
                      }`}
                    >
                      {position.name}
                    </button>
                  )
                })}
              </div>
              {positions.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Create positions in Staff settings to assign them here.
                </p>
              )}
            </div>

            {/* Save Button */}
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </CardContent>
        </Card>

        {/* Temporary Elevation */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Temporary Elevation</CardTitle>
            <CardDescription>Deputise this member to Manager until a stated time, or review past grants.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(() => {
              const liveGrant = grants.find((g) => g.is_live)
              return liveGrant ? (
                <Alert className="bg-blue-500/10 border-blue-500/20">
                  <AlertDescription>
                    Currently elevated to <strong>Manager</strong>
                    {liveGrant.expires_at ? (
                      <>
                        {" "}
                        until <LocalTime date={liveGrant.expires_at} formatStr="datetimelong" />
                      </>
                    ) : null}
                    .{" "}
                    <Button
                      variant="link"
                      className="h-auto p-0 text-destructive"
                      disabled={revokingGrantId === liveGrant.id}
                      onClick={() => handleRevoke(liveGrant.id)}
                    >
                      {revokingGrantId === liveGrant.id ? "Revoking..." : "Revoke now"}
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : staffMember.baseRole === "STAFF" ? (
                <Dialog open={deputiseOpen} onOpenChange={setDeputiseOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">Deputise to Manager</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Deputise to Manager</DialogTitle>
                      <DialogDescription>
                        {staffMember.user?.name} will act as Manager until the time you pick, then automatically
                        return to Staff.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                      <Label htmlFor="deputise-expires">Elevated until</Label>
                      <Input
                        id="deputise-expires"
                        type="datetime-local"
                        min={new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                        value={deputiseExpiresAt}
                        onChange={(e) => setDeputiseExpiresAt(e.target.value)}
                      />
                    </div>
                    {deputiseError && (
                      <Alert className="bg-destructive/10 border-destructive/20">
                        <AlertDescription className="text-destructive">{deputiseError}</AlertDescription>
                      </Alert>
                    )}
                    <DialogFooter>
                      <Button onClick={handleDeputise} disabled={isDeputising}>
                        {isDeputising ? "Granting..." : "Grant"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Already {staffMember.baseRole === "OWNER" ? "an owner" : "a manager"} - nothing to deputise.
                </p>
              )
            })()}

            {grants.length > 0 && (
              <div className="pt-4 border-t space-y-2">
                <p className="text-sm font-medium">History</p>
                {grants.map((grant) => (
                  <div key={grant.id} className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                      Manager, <LocalTime date={grant.granted_at} formatStr="datetime" /> →{" "}
                      {grant.expires_at ? <LocalTime date={grant.expires_at} formatStr="datetime" /> : "—"}
                    </span>
                    <Badge variant={grant.is_live ? "default" : "outline"}>
                      {grant.is_live ? "Live" : grant.revoked_at ? "Revoked" : "Expired"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-400">Danger Zone</CardTitle>
            <CardDescription>Irreversible actions for this staff member</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Remove Staff Member</p>
                <p className="text-sm text-muted-foreground">This will revoke their access to the venue</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={isDeleting}>
                    Remove Staff
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove Staff Member?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to remove {staffMember.user?.name} from this venue? They will lose all access
                      immediately. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRemove}>Remove Staff Member</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>

        {/* Back Button */}
        <div className="mt-6">
          <Button variant="outline" asChild>
            <Link href={`/dashboard/${slug}/staff`}>← Back to Staff</Link>
          </Button>
        </div>
      </div>
    </VenueLayoutClient>
  )
}
