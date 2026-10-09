"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { initials } from "@/lib/discord-picker-state"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Guild {
  id: string
  name: string
  iconUrl: string | null
}

interface CurrentLink {
  linkId: number
  guildId: string
  linkedAt: string
  linkedBy: string | null
  name: string | null
  iconUrl: string | null
}

interface Candidates {
  current: CurrentLink | null
  needsReauth: boolean
  guilds: Guild[]
}

function GuildIcon({ name, iconUrl, className }: { name: string; iconUrl: string | null; className?: string }) {
  return (
    <Avatar className={className ?? "size-5 rounded-md"}>
      {iconUrl && <AvatarImage src={iconUrl} alt="" />}
      <AvatarFallback className="rounded-md text-[9px] font-medium">{initials(name)}</AvatarFallback>
    </Avatar>
  )
}

// The venue's Discord server, as a link xvm-api holds rather than a channel id a person copies.
// Everything downstream — role, channel, member and emoji pickers — needs this to exist first.
export function DiscordGuildConnect({ venueId }: { venueId: string }) {
  const [state, setState] = useState<Candidates | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [chosen, setChosen] = useState("")
  const [saving, setSaving] = useState(false)
  const [unlinking, setUnlinking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/venues/${venueId}/discord/guilds`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setLoadError(body?.message ?? body?.error ?? `Couldn't load your servers (error ${res.status}).`)
        return
      }
      setLoadError(null)
      setState(await res.json())
    } catch {
      setLoadError("Couldn't reach the server.")
    }
  }, [venueId])

  useEffect(() => {
    // Genuine fetch, not derivable from props during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  async function connect() {
    if (!chosen) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/venues/${venueId}/discord/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildId: chosen }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.message ?? body?.error ?? "Couldn't connect that server.")
        return
      }
      setChosen("")
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function unlink() {
    setUnlinking(true)
    setError(null)
    try {
      const res = await fetch(`/api/venues/${venueId}/discord/link`, { method: "DELETE" })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.message ?? body?.error ?? "Couldn't disconnect that server.")
        return
      }
      await load()
    } finally {
      setUnlinking(false)
    }
  }

  if (loadError) return <p className="text-xs text-[var(--fg-faint)]">{loadError}</p>
  if (!state) return <p className="text-xs text-[var(--fg-faint)]">Loading your servers…</p>

  return (
    <div className="w-full space-y-3">
      {state.current ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--blue-015)] bg-[rgba(0,180,255,0.04)] px-3 py-2">
          <GuildIcon
            name={state.current.name ?? state.current.guildId}
            iconUrl={state.current.iconUrl}
            className="size-9 rounded-md"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{state.current.name ?? "Connected server"}</p>
            <p className="text-xs text-[var(--fg-faint)]">
              linked{" "}
              {new Date(state.current.linkedAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
              {state.current.linkedBy ? ` · by ${state.current.linkedBy}` : ""}
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive" size="sm" className="ml-auto" disabled={unlinking}>
                {unlinking ? "Unlinking…" : "Unlink"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Unlink this Discord server?</AlertDialogTitle>
                <AlertDialogDescription>
                  The bot will no longer know which venue{" "}
                  <strong>{state.current.name ?? state.current.guildId}</strong> belongs to, and the role,
                  channel, member and emoji pickers stop working for this venue. You can connect a server
                  again afterwards.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void unlink()}>Unlink</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : state.needsReauth ? (
        <p className="text-xs text-[var(--fg-faint)]">
          Sign out and back in, so Discord can tell us which servers you manage.
        </p>
      ) : state.guilds.length === 0 ? (
        <p className="text-xs text-[var(--fg-faint)]">
          You don&apos;t manage any Discord servers that we can see.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={chosen} onValueChange={setChosen}>
            <SelectTrigger size="sm" className="w-[280px]" aria-label="Discord server">
              <SelectValue placeholder="Choose a server…" />
            </SelectTrigger>
            <SelectContent align="start">
              {state.guilds.map((guild) => (
                <SelectItem key={guild.id} value={guild.id}>
                  <GuildIcon name={guild.name} iconUrl={guild.iconUrl} />
                  <span className="truncate">{guild.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" disabled={!chosen || saving} onClick={() => void connect()}>
            {saving ? "Connecting…" : "Connect"}
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
