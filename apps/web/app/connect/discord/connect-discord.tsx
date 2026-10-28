"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { signOut } from "next-auth/react"
import { ExternalLink } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DISCORD_BOT_INVITE_URL } from "@/lib/discord-invite"
import { initials } from "@/lib/discord-picker-state"
import {
  connectServer,
  signInUrl,
  type ConnectableVenue,
  type ConnectServer,
  type ConnectView,
} from "@/lib/connect-discord"

function Shell({
  server,
  title,
  description,
  children,
}: {
  server: ConnectServer | null
  title: string
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="container flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="justify-items-center text-center">
          {server && (
            <Avatar className="size-12 rounded-lg">
              {server.iconUrl && <AvatarImage src={server.iconUrl} alt="" />}
              <AvatarFallback className="rounded-lg text-sm font-medium">{initials(server.name ?? server.id)}</AvatarFallback>
            </Avatar>
          )}
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </div>
  )
}

function OpenVenue({ venue }: { venue: { name: string; slug: string } }) {
  return (
    <Button asChild className="w-full" size="lg">
      <Link href={`/dashboard/${venue.slug}`}>Open {venue.name}</Link>
    </Button>
  )
}

export function ConnectDiscord({ server, view }: { server: ConnectServer | null; view: ConnectView }) {
  const [connecting, setConnecting] = useState<string | null>(null)
  const [connected, setConnected] = useState<ConnectableVenue | null>(null)
  const [error, setError] = useState<string | null>(null)
  const serverName = server?.name ?? "This server"

  async function connect(venue: ConnectableVenue) {
    if (!server) return
    setConnecting(venue.id)
    setError(null)
    const problem = await connectServer(venue.slug, server.id)
    setConnecting(null)
    if (problem) setError(problem)
    else setConnected(venue)
  }

  if (connected) {
    return (
      <Shell server={server} title="Connected">
        <Alert className="border-green-400/20 bg-green-400/10">
          <AlertDescription className="text-emerald-400">
            {serverName} now belongs to <strong>{connected.name}</strong>. In Discord, /menu opens its menu.
          </AlertDescription>
        </Alert>
        <OpenVenue venue={connected} />
      </Shell>
    )
  }

  switch (view.kind) {
    case "bad-link":
      return (
        <Shell
          server={null}
          title="This link doesn't work"
          description="It doesn't name a Discord server. Open it again from the bot's Set Up on the Dashboard button."
        >
          <Button asChild variant="outline" className="w-full">
            <Link href="/dashboard">Go to your venues</Link>
          </Button>
        </Shell>
      )
    case "bot-absent":
      return (
        <Shell
          server={server}
          title="Add the bot first"
          description={`The XIV Venue Manager bot isn't in ${server?.name ?? "that server"}. Add it there, then open this link again.`}
        >
          <Button asChild className="w-full" size="lg">
            <a href={DISCORD_BOT_INVITE_URL} target="_blank" rel="noopener noreferrer">
              Add the bot <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </Shell>
      )
    case "reauth":
      return (
        <Shell
          server={server}
          title="Sign in again"
          description="Sign out and back in, so Discord can tell us which servers you manage."
        >
          <Button
            className="w-full"
            size="lg"
            onClick={() => void signOut({ callbackUrl: signInUrl(`/connect/discord?guild=${server?.id ?? ""}`) })}
          >
            Sign out and back in
          </Button>
        </Shell>
      )
    case "not-manager":
      return (
        <Shell
          server={server}
          title="You can't connect this server"
          description={`Connecting ${server?.name ?? "it"} needs Manage Server there. Ask someone who has it to open this link.`}
        >
          <Button asChild variant="outline" className="w-full">
            <Link href="/dashboard">Go to your venues</Link>
          </Button>
        </Shell>
      )
    case "unavailable":
      return (
        <Shell server={server} title="Couldn't finish loading" description="Try again in a moment.">
          <Button variant="outline" className="w-full" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </Shell>
      )
    case "connected":
      return (
        <Shell
          server={server}
          title="Already connected"
          description={
            view.venue ? (
              <>
                {serverName} is connected to <strong>{view.venue.name}</strong>.
              </>
            ) : (
              `${serverName} is connected to a venue already. Its owner can disconnect it in that venue's Settings.`
            )
          }
        >
          {view.venue && <OpenVenue venue={view.venue} />}
        </Shell>
      )
    case "choose":
      return (
        <Shell server={server} title={`Connect ${server?.name ?? "your server"}`} description="Choose the venue this server belongs to.">
          {view.venues.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You don&apos;t own a venue yet. Create one, and it connects this server as it&apos;s made.
            </p>
          ) : (
            <ul className="space-y-2">
              {view.venues.map((venue) => (
                <li
                  key={venue.id}
                  className="flex items-center gap-3 rounded-lg border border-[var(--blue-015)] px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{venue.name}</p>
                    <p className="text-xs text-[var(--fg-faint)]">
                      {venue.connectedElsewhere ? "Connected to another server" : `${venue.world} (${venue.dataCenter})`}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={venue.connectedElsewhere || connecting !== null}
                    onClick={() => void connect(venue)}
                  >
                    {connecting === venue.id ? "Connecting…" : "Connect"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button asChild variant="outline" className="w-full">
            <Link href={server ? `/get-started?guild=${server.id}` : "/get-started"}>Create a new venue</Link>
          </Button>
        </Shell>
      )
  }
}
