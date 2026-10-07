"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

interface Guild {
  id: string
  name: string
  iconUrl: string | null
}

interface Candidates {
  currentGuildId: string | null
  needsReauth: boolean
  guilds: Guild[]
}

// The venue's Discord server, as a link xvm-api holds rather than a channel id a person copies.
// Everything downstream — role, channel, member and emoji pickers — needs this to exist first.
export function DiscordGuildConnect({ venueId }: { venueId: string }) {
  const [state, setState] = useState<Candidates | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [chosen, setChosen] = useState("")
  const [saving, setSaving] = useState(false)
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

  if (loadError) return <p className="text-xs text-[var(--fg-faint)]">{loadError}</p>
  if (!state) return <p className="text-xs text-[var(--fg-faint)]">Loading your servers…</p>

  const current = state.guilds.find((guild) => guild.id === state.currentGuildId)

  return (
    <div className="w-full space-y-2">
      {state.currentGuildId ? (
        <p className="text-sm">
          Connected to <strong>{current?.name ?? state.currentGuildId}</strong>
        </p>
      ) : (
        <p className="text-xs text-[var(--fg-faint)]">
          No Discord server connected yet. Role, channel and member pickers need this.
        </p>
      )}

      {state.needsReauth ? (
        <p className="text-xs text-[var(--fg-faint)]">
          Sign out and back in, so Discord can tell us which servers you manage.
        </p>
      ) : state.guilds.length === 0 ? (
        <p className="text-xs text-[var(--fg-faint)]">
          You don&apos;t manage any Discord servers that we can see.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            className="rounded-[var(--radius-sm)] border border-[var(--blue-015)] bg-background px-3 py-1.5 text-sm focus:border-[var(--blue-035)] focus:outline-none"
          >
            <option value="">{state.currentGuildId ? "Change server…" : "Choose a server…"}</option>
            {state.guilds.map((guild) => (
              <option key={guild.id} value={guild.id}>
                {guild.name}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" disabled={!chosen || saving} onClick={() => void connect()}>
            {saving ? "Connecting…" : "Connect"}
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
