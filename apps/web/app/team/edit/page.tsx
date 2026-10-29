"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { PageLoading } from "@/components/ui/loading-spinner"
import { TeamRow } from "@/components/team-row"
import { TEAM_BIO_MAX } from "@/lib/team-groups"
import type { TeamProfile } from "@/lib/api/xvm-api"

const PHOTO_TYPES = "image/png,image/jpeg,image/webp,image/gif"

async function message(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null)
  return typeof body?.error === "string" ? body.error : fallback
}

export default function EditTeamCardPage() {
  const { status } = useSession()
  const router = useRouter()
  const [profile, setProfile] = useState<TeamProfile | null>(null)
  const [bio, setBio] = useState("")
  const [listed, setListed] = useState(true)
  const [loading, setLoading] = useState(true)
  const [notOnTeam, setNotOnTeam] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin")
  }, [status, router])

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/team/profile")
      .then(async (res) => {
        if (res.status === 404) return setNotOnTeam(true)
        if (!res.ok) return setError(await message(res, "Couldn't load your card."))
        const card: TeamProfile = await res.json()
        setProfile(card)
        setBio(card.bio ?? "")
        setListed(card.listed)
      })
      .catch(() => setError("Couldn't reach the server."))
      .finally(() => setLoading(false))
  }, [status])

  async function save() {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch("/api/team/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio: bio.trim() === "" ? null : bio, listed }),
      })
      if (!res.ok) return setError(await message(res, "Couldn't save your card."))
      setProfile(await res.json())
      setSaved(true)
    } catch {
      setError("Couldn't reach the server.")
    } finally {
      setBusy(false)
    }
  }

  async function upload(file: File) {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/team/profile/photo", { method: "PUT", body: form })
      if (!res.ok) return setError(await message(res, "Couldn't upload that photo."))
      setProfile(await res.json())
    } catch {
      setError("Couldn't reach the server.")
    } finally {
      setBusy(false)
    }
  }

  if (status === "loading" || loading) return <PageLoading />

  if (notOnTeam) {
    return (
      <div className="mx-auto max-w-[640px] px-4 pb-20 pt-16 sm:px-6">
        <h1 className="font-cinzel text-2xl font-bold tracking-wide">You are not on the team page</h1>
        <p className="mt-3 text-muted-foreground">An admin adds people to the team. Ask one to add you, then come back here.</p>
        <Link href="/team" className="mt-6 inline-block text-sm text-[var(--xiv-blue)]">
          Back to the team page
        </Link>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-[640px] px-4 pb-20 pt-16 sm:px-6">
        <p className="text-muted-foreground">{error ?? "Couldn't load your card."}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[760px] px-4 pb-20 pt-16 sm:px-6">
      <Link href="/team" className="text-sm text-muted-foreground transition-colors hover:text-[var(--xiv-blue)]">
        ← Back to the team page
      </Link>
      <h1 className="mt-4 font-cinzel text-2xl font-bold tracking-wide">Edit my card</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your {profile.roles.length === 1 ? "role is" : "roles are"}{" "}
        <strong className="text-foreground">{profile.roles.join(", ")}</strong> in the{" "}
        <strong className="text-foreground">{profile.group}</strong> group. An admin sets these.
      </p>

      <div className="mt-6 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="photo">Photo</Label>
          <input
            id="photo"
            type="file"
            accept={PHOTO_TYPES}
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void upload(file)
              e.target.value = ""
            }}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-[var(--blue-035)] file:bg-[var(--blue-010)] file:px-3 file:py-1.5 file:text-[var(--xiv-blue)]"
          />
          <p className="text-xs text-muted-foreground">PNG, JPEG, WebP or GIF, up to 8 MB. It is shown as a 120px square.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">About you</Label>
          <Textarea
            id="bio"
            value={bio}
            maxLength={TEAM_BIO_MAX}
            rows={6}
            onChange={(e) => {
              setBio(e.target.value)
              setSaved(false)
            }}
          />
          <p className="text-right text-xs text-muted-foreground">
            {bio.length}/{TEAM_BIO_MAX}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="listed"
            checked={listed}
            onCheckedChange={(value) => {
              setListed(value)
              setSaved(false)
            }}
          />
          <Label htmlFor="listed">Show my card on the team page</Label>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={busy}>
            Save
          </Button>
          {saved && <span className="text-sm text-[var(--success-text)]">Saved.</span>}
        </div>
      </div>

      <h2 className="mb-3 mt-10 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--xiv-blue)]">Preview</h2>
      <TeamRow member={{ ...profile, bio: bio.trim() === "" ? null : bio }} />
    </div>
  )
}
