"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { EditorHeader } from "@/components/editor-header"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PillToggle } from "@/components/pill-toggle"
import { ChannelPicker, useDiscordOptions } from "@/components/discord-picker"
import { ChoiceField, PronounField } from "@/components/profile-choice-field"
import { ProfileGallery, ProfileImageSlot } from "@/components/profile-images"
import { toast } from "sonner"
import { ApiError, apiRoute } from "@/lib/api-fetch"
import { colorToHex, hexToColor } from "@/lib/audit-log-events"
import {
  clanChoices,
  CUSTOM,
  GENDERS,
  ORIENTATIONS,
  PROFILE_LIMITS,
  RACES,
  STATUS_LABELS,
  SYNC_TOOLS,
} from "@/lib/profiles"
import { SNOWFLAKE_PATTERN } from "@/lib/validation"
import { useMounted } from "@/lib/use-mounted"
import type { ProfilePostRow, ProfileRow } from "@/lib/api/xvm-api"

type Section = "basics" | "glance" | "personality" | "images" | "share"

const SECTIONS: ReadonlyArray<{ id: Section; label: string }> = [
  { id: "basics", label: "Basics" },
  { id: "glance", label: "At a glance" },
  { id: "personality", label: "Personality" },
  { id: "images", label: "Images" },
  { id: "share", label: "Share" },
]

export interface ProfileEditorProps {
  venueId: string
  profile: ProfileRow
  approvalRequired: boolean
  onChange: (profile: ProfileRow) => void
  onClose: () => void
}

type SectionProps = Pick<ProfileEditorProps, "venueId" | "profile" | "onChange">

async function patch(venueId: string, profile: ProfileRow, body: Record<string, unknown>, success: string, onChange: (p: ProfileRow) => void) {
  try {
    const saved = await apiRoute<ProfileRow>("/api/venues/[venueId]/profiles/[profileId]", {
      params: { venueId, profileId: profile.id },
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    onChange(saved)
    toast.success(success)
    return true
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message.replace(/^Value error, /, "") : "Failed to save the sheet.")
    return false
  }
}

function Basics({ venueId, profile, onChange }: SectionProps) {
  const [name, setName] = useState(profile.character_name)
  const [color, setColor] = useState(profile.color === null ? "" : colorToHex(profile.color))
  const [jobs, setJobs] = useState(profile.jobs ?? "")
  const [rates, setRates] = useState(profile.rates ?? "")
  const [saving, setSaving] = useState(false)

  async function save() {
    if (name.trim() === "") {
      toast.error("Give the character a name.")
      return
    }
    setSaving(true)
    await patch(
      venueId,
      profile,
      { characterName: name.trim(), color: color === "" ? null : hexToColor(color), jobs, rates },
      "Basics saved.",
      onChange
    )
    setSaving(false)
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="space-y-2">
          <Label htmlFor="profile-name">Character name</Label>
          <Input id="profile-name" value={name} maxLength={PROFILE_LIMITS.characterName} onChange={(e) => setName(e.target.value)} disabled={saving} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-color">Colour</Label>
          <div className="flex items-center gap-2">
            <input
              id="profile-color"
              type="color"
              value={color || "#5865f2"}
              onChange={(e) => setColor(e.target.value)}
              disabled={saving}
              className="h-7 w-7 cursor-pointer appearance-none rounded-full border border-[var(--blue-018)] bg-transparent p-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0"
            />
            {color !== "" && (
              <button type="button" onClick={() => setColor("")} className="text-xs text-[var(--fg-faint)] hover:text-[var(--xiv-blue)]">
                No colour
              </button>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-jobs">RP jobs, comma-separated</Label>
          <Input id="profile-jobs" value={jobs} maxLength={PROFILE_LIMITS.jobs} placeholder="Bartender, Dancer, Host" onChange={(e) => setJobs(e.target.value)} disabled={saving} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-rates">Rates</Label>
          <Textarea id="profile-rates" rows={3} value={rates} maxLength={PROFILE_LIMITS.rates} onChange={(e) => setRates(e.target.value)} disabled={saving} />
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save basics"}
        </Button>
      </CardContent>
    </Card>
  )
}

function Glance({ venueId, profile, onChange }: SectionProps) {
  const [race, setRace] = useState(profile.race ?? "")
  const [raceCustom, setRaceCustom] = useState(profile.race_custom ?? "")
  const [clan, setClan] = useState(profile.clan ?? "")
  const [clanCustom, setClanCustom] = useState(profile.clan_custom ?? "")
  const [gender, setGender] = useState(profile.gender ?? "")
  const [genderCustom, setGenderCustom] = useState(profile.gender_custom ?? "")
  const [pronouns, setPronouns] = useState(profile.pronouns ?? "")
  const [pronounsCustom, setPronounsCustom] = useState(profile.pronouns_custom ?? "")
  const [orientation, setOrientation] = useState(profile.orientation ?? "")
  const [orientationCustom, setOrientationCustom] = useState(profile.orientation_custom ?? "")
  const [dataCenter, setDataCenter] = useState(profile.data_center ?? "")
  const [world, setWorld] = useState(profile.world ?? "")
  const [height, setHeight] = useState(profile.height ?? "")
  const [age, setAge] = useState(profile.age ?? "")
  const [syncType, setSyncType] = useState(profile.pairing_code_type ?? "")
  const [syncCustom, setSyncCustom] = useState(profile.pairing_code_type_custom ?? "")
  const [syncCode, setSyncCode] = useState(profile.pairing_code ?? "")
  const [saving, setSaving] = useState(false)

  const customOf = (value: string, text: string) => (value === CUSTOM ? text : "")

  async function save() {
    setSaving(true)
    await patch(
      venueId,
      profile,
      {
        race,
        raceCustom: customOf(race, raceCustom),
        clan,
        clanCustom: customOf(clan, clanCustom),
        gender,
        genderCustom: customOf(gender, genderCustom),
        pronouns,
        pronounsCustom,
        orientation,
        orientationCustom: customOf(orientation, orientationCustom),
        dataCenter,
        world,
        height,
        age,
        pairingCodeType: syncType,
        pairingCodeTypeCustom: customOf(syncType, syncCustom),
        pairingCode: syncCode,
      },
      "At a glance saved.",
      onChange
    )
    setSaving(false)
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <ChoiceField id="profile-race" label="Race" choices={RACES} value={race} custom={raceCustom} onChange={(v, c) => { setRace(v); setRaceCustom(c) }} disabled={saving} />
          <ChoiceField id="profile-clan" label="Clan" choices={clanChoices(race)} value={clan} custom={clanCustom} onChange={(v, c) => { setClan(v); setClanCustom(c) }} disabled={saving} />
          <ChoiceField id="profile-gender" label="Gender" choices={GENDERS} value={gender} custom={genderCustom} onChange={(v, c) => { setGender(v); setGenderCustom(c) }} disabled={saving} />
          <ChoiceField id="profile-orientation" label="Orientation" choices={ORIENTATIONS} value={orientation} custom={orientationCustom} onChange={(v, c) => { setOrientation(v); setOrientationCustom(c) }} disabled={saving} />
        </div>
        <PronounField value={pronouns} custom={pronounsCustom} onChange={(v, c) => { setPronouns(v); setPronounsCustom(c) }} disabled={saving} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="profile-dc">Data centre</Label>
            <Input id="profile-dc" value={dataCenter} maxLength={PROFILE_LIMITS.choice} onChange={(e) => setDataCenter(e.target.value)} disabled={saving} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-world">Home world</Label>
            <Input id="profile-world" value={world} maxLength={PROFILE_LIMITS.world} onChange={(e) => setWorld(e.target.value)} disabled={saving} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-height">Height</Label>
            <Input id="profile-height" value={height} maxLength={PROFILE_LIMITS.custom} onChange={(e) => setHeight(e.target.value)} disabled={saving} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-age">Age</Label>
            <Input id="profile-age" value={age} maxLength={PROFILE_LIMITS.age} placeholder="Older than you think" onChange={(e) => setAge(e.target.value)} disabled={saving} />
          </div>
          <ChoiceField id="profile-sync-type" label="Mod-sync tool" choices={SYNC_TOOLS} value={syncType} custom={syncCustom} onChange={(v, c) => { setSyncType(v); setSyncCustom(c) }} disabled={saving} />
          <div className="space-y-2">
            <Label htmlFor="profile-sync-code">Sync code</Label>
            <Input id="profile-sync-code" value={syncCode} maxLength={PROFILE_LIMITS.pairingCode} onChange={(e) => setSyncCode(e.target.value)} disabled={saving} />
          </div>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save at a glance"}
        </Button>
      </CardContent>
    </Card>
  )
}

function Personality({ venueId, profile, onChange }: SectionProps) {
  const [likes, setLikes] = useState(profile.likes ?? "")
  const [dislikes, setDislikes] = useState(profile.dislikes ?? "")
  const [personality, setPersonality] = useState(profile.personality ?? "")
  const [aboutMe, setAboutMe] = useState(profile.about_me ?? "")
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await patch(venueId, profile, { likes, dislikes, personality, aboutMe }, "Personality saved.", onChange)
    setSaving(false)
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="space-y-2">
          <Label htmlFor="profile-likes">Likes, comma-separated</Label>
          <Textarea id="profile-likes" rows={3} value={likes} maxLength={PROFILE_LIMITS.likes} onChange={(e) => setLikes(e.target.value)} disabled={saving} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-dislikes">Dislikes, comma-separated</Label>
          <Textarea id="profile-dislikes" rows={3} value={dislikes} maxLength={PROFILE_LIMITS.dislikes} onChange={(e) => setDislikes(e.target.value)} disabled={saving} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-personality">Personality</Label>
          <Textarea id="profile-personality" rows={3} value={personality} maxLength={PROFILE_LIMITS.personality} onChange={(e) => setPersonality(e.target.value)} disabled={saving} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-about">About me</Label>
          <Textarea id="profile-about" rows={6} value={aboutMe} maxLength={PROFILE_LIMITS.aboutMe} onChange={(e) => setAboutMe(e.target.value)} disabled={saving} />
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save personality"}
        </Button>
      </CardContent>
    </Card>
  )
}

function Images({ venueId, profile, onChange }: SectionProps) {
  return (
    <Card>
      <CardContent className="space-y-6 p-5">
        <ProfileImageSlot venueId={venueId} profileId={profile.id} label="Thumbnail" slot="thumbnail" url={profile.thumbnail_url} onChange={(p) => onChange({ ...profile, ...p })} />
        <ProfileImageSlot venueId={venueId} profileId={profile.id} label="Main image" slot="main-image" url={profile.main_image_url} onChange={(p) => onChange({ ...profile, ...p })} />
        <ProfileGallery venueId={venueId} profileId={profile.id} images={profile.images} onChange={(images) => onChange({ ...profile, images })} />
      </CardContent>
    </Card>
  )
}

function Share({ venueId, profile, approvalRequired, onChange }: SectionProps & { approvalRequired: boolean }) {
  const [busy, setBusy] = useState(false)
  const [channel, setChannel] = useState("")
  const [posts, setPosts] = useState<ProfilePostRow[] | null>(null)
  const [postsFailed, setPostsFailed] = useState(false)
  const channels = useDiscordOptions(venueId, "channels")
  const channelName = (id: string) => channels.options.find((o) => o.value === id)?.label ?? id
  const mounted = useMounted()
  const params = { venueId, profileId: profile.id }

  useEffect(() => {
    apiRoute<ProfilePostRow[]>("/api/venues/[venueId]/profiles/[profileId]/posts", { params: { venueId, profileId: profile.id } })
      .then(setPosts)
      .catch(() => setPostsFailed(true))
  }, [venueId, profile.id])

  async function run(action: () => Promise<unknown>, success: string, failure: string) {
    setBusy(true)
    try {
      await action()
      toast.success(success)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : failure)
    } finally {
      setBusy(false)
    }
  }

  const submit = () =>
    run(
      async () => onChange(await apiRoute<ProfileRow>("/api/venues/[venueId]/profiles/[profileId]/submit", { params, method: "POST" })),
      "Submitted for review.",
      "Failed to submit the sheet."
    )

  const makePrimary = () =>
    run(
      async () => onChange(await apiRoute<ProfileRow>("/api/venues/[venueId]/profiles/[profileId]/primary", { params, method: "PUT" })),
      "This is now your primary sheet.",
      "Failed to set the primary sheet."
    )

  const post = () => {
    if (!SNOWFLAKE_PATTERN.test(channel)) {
      toast.error("Choose a channel to post in.")
      return Promise.resolve()
    }
    return run(
      () =>
        apiRoute("/api/venues/[venueId]/profiles/[profileId]/posts", {
          params,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelId: channel }),
        }),
      "Posting. The bot puts the card in the channel in a moment.",
      "Failed to post the sheet."
    )
  }

  const takeDown = () =>
    run(
      async () => {
        await apiRoute("/api/venues/[venueId]/profiles/[profileId]/posts", { params, method: "DELETE" })
        setPosts([])
      },
      "Taken down.",
      "Failed to take the sheet down."
    )

  const canSubmit = approvalRequired && (profile.status === "draft" || profile.status === "rejected")

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="tag">{STATUS_LABELS[profile.status]}</Badge>
          {profile.is_primary && <Badge variant="tag">Primary</Badge>}
        </div>
        {profile.status === "rejected" && profile.rejection_reason && (
          <p className="text-sm text-destructive">Rejected: {profile.rejection_reason}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {canSubmit && (
            <Button onClick={submit} disabled={busy}>
              Submit for review
            </Button>
          )}
          {!profile.is_primary && (
            <Button variant="outline-blue" onClick={makePrimary} disabled={busy}>
              Make primary
            </Button>
          )}
        </div>
        {approvalRequired && profile.status !== "approved" && (
          <p className="text-xs text-muted-foreground">This venue needs a manager to approve a sheet before the bot will post it.</p>
        )}

        <div className="space-y-2 border-t pt-5">
          <Label>Post the card</Label>
          <div className="flex flex-wrap items-center gap-2">
            <ChannelPicker venueId={venueId} value={channel} onChange={setChannel} disabled={busy} />
            <Button onClick={post} disabled={busy}>
              Post
            </Button>
            <Button variant="outline" onClick={takeDown} disabled={busy}>
              Take down
            </Button>
          </div>
          {postsFailed ? (
            <p className="text-sm text-muted-foreground">Couldn&apos;t load the posts.</p>
          ) : posts === null ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not posted anywhere.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {posts.map((row) => (
                <li key={`${row.channel_id}-${row.message_id ?? "pending"}`} className="flex flex-wrap justify-between gap-2">
                  <span>{channelName(row.channel_id)}</span>
                  <span className="text-muted-foreground">
                    {row.posted_at ? (mounted ? format(new Date(row.posted_at), "PPp") : "") : "Waiting for the bot"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function ProfileEditor({ venueId, profile, approvalRequired, onChange, onClose }: ProfileEditorProps) {
  const [section, setSection] = useState<Section>("basics")

  return (
    <div className="space-y-4">
      <EditorHeader backTo="Profiles" onBack={onClose} title={profile.character_name} />
      <PillToggle label="Sheet section" options={SECTIONS} value={section} onChange={setSection} />
      {section === "basics" && <Basics venueId={venueId} profile={profile} onChange={onChange} />}
      {section === "glance" && <Glance venueId={venueId} profile={profile} onChange={onChange} />}
      {section === "personality" && <Personality venueId={venueId} profile={profile} onChange={onChange} />}
      {section === "images" && <Images venueId={venueId} profile={profile} onChange={onChange} />}
      {section === "share" && <Share venueId={venueId} profile={profile} approvalRequired={approvalRequired} onChange={onChange} />}
    </div>
  )
}
