"use client"

import { use, useEffect, useState } from "react"
import { useSession, signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LocalTime } from "@/components/server-time"
import { AlertCircle, CheckCircle2, Loader2, Users, BookOpen } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

const GUIDE_LINK_BY_ROLE: Record<string, { href: string; label: string }> = {
  OWNER: { href: "/guide/owner", label: "Owner & Manager Guide" },
  MANAGER: { href: "/guide/owner", label: "Owner & Manager Guide" },
  STAFF: { href: "/guide/staff", label: "Staff Guide" },
}

interface InviteDetails {
  venue: {
    name: string
    slug: string
  }
  role: string
  invitedName?: string
  expiresAt: string
  invitedBy: {
    name?: string
  }
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const unwrappedParams = use(params)
  const { data: session } = useSession()
  const router = useRouter()
  const [inviteDetails, setInviteDetails] = useState<InviteDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [acceptedVenueSlug, setAcceptedVenueSlug] = useState<string | null>(null)
  const [acceptedRole, setAcceptedRole] = useState<string | null>(null)

  async function handleAcceptInvite() {
    setAccepting(true)
    setError(null)

    try {
      const response = await fetch(`/api/invites/${unwrappedParams.token}/accept`, {
        method: "POST",
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || "Failed to accept invite")
        setAccepting(false)
        return
      }

      const data = await response.json()
      setAcceptedVenueSlug(data.venue?.slug ?? null)
      setAcceptedRole(data.membership.role)
      setSuccess(true)

      // Refresh now so the dashboard has the new membership ready by the time
      // the user clicks through - they choose when to leave this screen.
      router.refresh()
    } catch (err) {
      console.error("Error accepting invite:", err)
      setError("Failed to accept invite")
      setAccepting(false)
    }
  }

  // Fetch invite details
  useEffect(() => {
    async function fetchInviteDetails() {
      try {
        const response = await fetch(`/api/invites/${unwrappedParams.token}`)
        if (!response.ok) {
          const data = await response.json()
          setError(data.error || "Invalid or expired invite")
          setLoading(false)
          return
        }
        const data = await response.json()
        setInviteDetails(data.invite)
        setLoading(false)
      } catch (err) {
        console.error("Error fetching invite:", err)
        setError("Failed to load invite details")
        setLoading(false)
      }
    }

    fetchInviteDetails()
  }, [unwrappedParams.token])

  // Auto-accept if user is already logged in
  useEffect(() => {
    if (session && inviteDetails && !accepting && !success && !error) {
      // Genuine post-mount side effect: auto-accepts for an already-logged-in user, not derivable at render time.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handleAcceptInvite()
    }
  }, [session, inviteDetails])

  async function handleDiscordSignIn() {
    // Sign in with Discord and return to this page
    await signIn("discord", {
      callbackUrl: `/invite/${unwrappedParams.token}`,
    })
  }

  if (loading) {
    return (
      <div className="container flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading invite...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-400" />
              Invite Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <div className="mt-6">
              <Button onClick={() => router.push("/")} variant="outline" className="w-full">
                Go to Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (success) {
    const guide = acceptedRole ? GUIDE_LINK_BY_ROLE[acceptedRole] : undefined

    return (
      <div className="container flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              Invite Accepted!
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="bg-green-400/10 border-green-400/20">
              <AlertDescription className="text-emerald-400">
                You have successfully joined <strong>{inviteDetails?.venue.name}</strong> as{" "}
                <strong>{inviteDetails?.role.toLowerCase()}</strong>.
              </AlertDescription>
            </Alert>

            {guide && (
              <a href={guide.href} target="_blank" rel="noopener noreferrer" className="block">
                <Button variant="outline" className="w-full">
                  <BookOpen className="mr-2 h-4 w-4" />
                  Read the {guide.label}
                </Button>
              </a>
            )}

            <Button
              className="w-full"
              size="lg"
              onClick={() => acceptedVenueSlug && router.push(`/dashboard/${acceptedVenueSlug}`)}
              disabled={!acceptedVenueSlug}
            >
              Continue to dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!session && inviteDetails) {
    return (
      <div className="container flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>You&apos;ve been invited!</CardTitle>
            <CardDescription>
              <strong>{inviteDetails.invitedBy.name || "A venue manager"}</strong> has invited you to join{" "}
              <strong>{inviteDetails.venue.name}</strong> as <strong>{inviteDetails.role.toLowerCase()}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {inviteDetails.invitedName && (
              <div className="rounded-lg bg-muted p-4">
                <div className="text-sm text-muted-foreground">Invited as:</div>
                <div className="font-medium">{inviteDetails.invitedName}</div>
              </div>
            )}

            <div className="space-y-2">
              <div className="text-sm text-muted-foreground text-center">
                Sign in with Discord to accept this invitation
              </div>
              <Button onClick={handleDiscordSignIn} className="w-full" size="lg">
                <Users className="mr-2 h-5 w-5" />
                Sign in with Discord
              </Button>
            </div>

            <div className="text-xs text-center text-muted-foreground">
              Invite expires: <LocalTime date={inviteDetails.expiresAt} formatStr="datetimelong" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (accepting && inviteDetails) {
    return (
      <div className="container flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Accepting invite...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return null
}
