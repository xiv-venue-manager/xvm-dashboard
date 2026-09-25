"use client"

import { use, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2, Copy, Link as LinkIcon, Share2 } from "lucide-react"
import { VenueLayoutClient } from "@/components/venue-layout-client"
import { canManageVenue } from "@/lib/roles"
import { PageLoading } from "@/components/ui/loading-spinner"

export default function InviteStaffPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const router = useRouter()
  const [name, setName] = useState("")
  const [discordId, setDiscordId] = useState("")
  const [role, setRole] = useState<"STAFF" | "MANAGER" | "OWNER">("STAFF")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [inviteUrl, setInviteUrl] = useState("")
  const [copied, setCopied] = useState(false)
  const [canShare, setCanShare] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState<string>("")
  const [roleChecked, setRoleChecked] = useState(false)

  // Check if Web Share API is available; must run post-mount to avoid a server/client hydration mismatch on `navigator`.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanShare(typeof navigator !== "undefined" && !!navigator.share)
  }, [])

  // Fetch user's role for the venue
  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const venueResponse = await fetch(`/api/venues?slug=${slug}`)
        if (!venueResponse.ok) return

        const venues = await venueResponse.json()
        const venue = venues.find((v: { slug: string }) => v.slug === slug)

        if (venue?.memberships?.[0]?.role) {
          setCurrentUserRole(venue.memberships[0].role)
        }
      } catch (err) {
        console.error("Failed to fetch user role:", err)
      } finally {
        setRoleChecked(true)
      }
    }

    fetchUserRole()
  }, [slug])

  useEffect(() => {
    if (roleChecked && !canManageVenue(currentUserRole)) {
      router.replace(`/dashboard/${slug}/staff`)
    }
  }, [roleChecked, currentUserRole, slug, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")
    setInviteUrl("")

    try {
      // Create invite - the route resolves slug-or-id itself, no separate lookup needed.
      const response = await fetch(`/api/venues/${slug}/staff/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role,
          invitedName: name || null,
          discordId: discordId.trim() || null,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to create invite")
      }

      const data = await response.json()
      setInviteUrl(data.invite.inviteUrl)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopyLink = async () => {
    if (inviteUrl) {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleShare = async () => {
    if (inviteUrl && navigator.share) {
      try {
        await navigator.share({
          title: "Join Our Venue Staff",
          text: `You've been invited to join ${name ? name + "'s venue" : "our venue"} staff! Click the link to accept:`,
          url: inviteUrl,
        })
      } catch (err) {
        // User cancelled share or error occurred
      }
    }
  }

  const handleCreateAnother = () => {
    setName("")
    setRole("STAFF")
    setInviteUrl("")
    setError("")
  }

  if (inviteUrl) {
    return (
      <VenueLayoutClient slug={slug}>
        <div className="page-inner max-w-2xl">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl md:text-4xl font-bold">Invite Link Created!</h1>
            <p className="text-muted-foreground mt-2">Share this link with your new staff member</p>
          </div>

          {/* Success Card */}
          <Card className="mb-6 border-green-400/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                Invitation Ready
              </CardTitle>
              <CardDescription>
                {name && `Invite for ${name} has been created. `}
                This link expires in 7 days.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Invite Link Display */}
              <div className="space-y-2">
                <Label>Invite Link</Label>
                <div className="flex gap-2">
                  <Input value={inviteUrl} readOnly className="font-mono text-sm" />
                  <Button onClick={handleCopyLink} variant="outline" className="shrink-0">
                    {copied ? (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="mr-2 h-4 w-4" />
                        Copy
                      </>
                    )}
                  </Button>
                  {canShare && (
                    <Button onClick={handleShare} variant="outline" className="shrink-0">
                      <Share2 className="mr-2 h-4 w-4" />
                      Share
                    </Button>
                  )}
                </div>
              </div>

              {/* Invite Details */}
              <div className="rounded-lg bg-muted p-4 space-y-2 text-sm">
                <p>
                  <strong>Role:</strong> {role}
                </p>
                {name && (
                  <p>
                    <strong>Name:</strong> {name}
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 pt-4">
                <Button onClick={handleCreateAnother} variant="outline">
                  <LinkIcon className="mr-2 h-4 w-4" />
                  Create Another Invite
                </Button>
                <Button asChild>
                  <Link href={`/dashboard/${slug}/staff`}>View Staff List</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Instructions Card */}
          <Card>
            <CardHeader>
              <CardTitle>Next Steps</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                1. <strong>Share the link</strong> using the Share button to send directly via Discord, or Copy to paste
                manually
              </p>
              <p>
                2. <strong>Send it to your staff member</strong> via Discord DM or other secure method
              </p>
              <p>
                3. <strong>They&apos;ll sign in with Discord</strong> and be automatically added to your venue
              </p>
              <p>
                4. <strong>Check pending invites</strong> on the staff page to see who hasn&apos;t accepted yet
              </p>
            </CardContent>
          </Card>
        </div>
      </VenueLayoutClient>
    )
  }

  if (!roleChecked || !canManageVenue(currentUserRole)) {
    return (
      <VenueLayoutClient slug={slug}>
        <div className="page-inner">
          <PageLoading />
        </div>
      </VenueLayoutClient>
    )
  }

  return (
    <VenueLayoutClient slug={slug}>
      <div className="page-inner max-w-2xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-4xl font-bold">Create Staff Invite</h1>
          <p className="text-muted-foreground mt-2">Generate a unique invite link for a new team member</p>
        </div>

        {/* Error Message */}
        {error && (
          <Alert className="mb-6 bg-destructive/10 border-destructive/20">
            <AlertDescription className="text-destructive">{error}</AlertDescription>
          </Alert>
        )}

        {/* Invite Form */}
        <Card>
          <CardHeader>
            <CardTitle>Staff Information</CardTitle>
            <CardDescription>All fields are optional. The invite link will work regardless.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Name Input (Optional) */}
              <div className="space-y-2">
                <Label htmlFor="name">
                  Name <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isLoading}
                />
                <p className="text-sm text-muted-foreground">For your reference. Helps you identify pending invites.</p>
              </div>

              {/* Discord ID (Optional) */}
              <div className="space-y-2">
                <Label htmlFor="discordId">
                  Discord user ID <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="discordId"
                  type="text"
                  inputMode="numeric"
                  placeholder="123456789012345678"
                  value={discordId}
                  onChange={(e) => setDiscordId(e.target.value)}
                  disabled={isLoading}
                />
                <p className="text-sm text-muted-foreground">
                  Lets you send the invite to them as a Discord DM from the pending list. Without it, share the link
                  yourself.
                </p>
              </div>

              {/* Role Selection */}
              <div className="space-y-2">
                <Label htmlFor="role">
                  Role <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={role}
                  onValueChange={(value: string) => setRole(value as "STAFF" | "MANAGER" | "OWNER")}
                  disabled={isLoading}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STAFF">Staff</SelectItem>
                    <SelectItem value="MANAGER">Manager</SelectItem>
                    {currentUserRole === "OWNER" && <SelectItem value="OWNER">Owner</SelectItem>}
                  </SelectContent>
                </Select>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>
                    <strong>Staff:</strong> Can view events, log sales, view tasks
                  </p>
                  <p>
                    <strong>Manager:</strong> Can create/edit events, manage tasks, view reports
                  </p>
                  {currentUserRole === "OWNER" && (
                    <p>
                      <strong>Owner:</strong> Full access - can manage all settings, staff, and remove other owners
                    </p>
                  )}
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:gap-4">
                <Button type="submit" disabled={isLoading} className="w-full sm:w-auto">
                  {isLoading ? "Generating Link..." : "Generate Invite Link"}
                </Button>
                <Button type="button" variant="outline" asChild disabled={isLoading} className="w-full sm:w-auto">
                  <Link href={`/dashboard/${slug}/staff`}>Cancel</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>How Discord Invites Work</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              1. <strong>Generate Link:</strong> Create a unique, secure invite link
            </p>
            <p>
              2. <strong>Share Link:</strong> Send the link to your staff member via Discord DM
            </p>
            <p>
              3. <strong>Discord Sign-In:</strong> They click the link and sign in with Discord
            </p>
            <p>
              4. <strong>Auto-Accept:</strong> They&apos;re automatically added to your venue
            </p>
            <p className="pt-2 text-xs">Links expire after 7 days and can only be used once.</p>
          </CardContent>
        </Card>
      </div>
    </VenueLayoutClient>
  )
}
