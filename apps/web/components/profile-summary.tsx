"use client"

import { Badge } from "@/components/ui/badge"
import { MemberChip } from "@/components/discord-members"
import { colorToHex } from "@/lib/audit-log-events"
import { CLANS, chosen, GENDERS, ORIENTATIONS, pronounLabel, RACES, STATUS_LABELS, SYNC_TOOLS } from "@/lib/profiles"
import type { ProfileRow } from "@/lib/api/xvm-api"

export interface ProfileSummaryProps {
  profile: ProfileRow
  ownerLabel?: string
  ownerAvatarUrl?: string | null
  detailed?: boolean
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex flex-wrap gap-x-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  )
}

export function ProfileSummary({ profile, ownerLabel, ownerAvatarUrl, detailed = false }: ProfileSummaryProps) {
  const race = chosen(RACES, profile.race, profile.race_custom)
  const clan = profile.clan === "na" ? null : chosen(CLANS, profile.clan, profile.clan_custom)
  const home = profile.world ? (profile.data_center ? `${profile.world} (${profile.data_center})` : profile.world) : null
  const sync = chosen(SYNC_TOOLS, profile.pairing_code_type, profile.pairing_code_type_custom)

  return (
    <div className="flex gap-4">
      {profile.thumbnail_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.thumbnail_url} alt="" className="h-16 w-16 flex-none rounded object-cover" />
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold" style={profile.color === null ? undefined : { color: colorToHex(profile.color) }}>
            {profile.character_name}
          </p>
          <Badge variant="tag">{STATUS_LABELS[profile.status]}</Badge>
          {profile.is_primary && <Badge variant="tag">Primary</Badge>}
        </div>
        {ownerLabel && <MemberChip label={ownerLabel} avatarUrl={ownerAvatarUrl} />}
        <dl className="space-y-0.5">
          <Row label="Race" value={[race, clan].filter(Boolean).join(", ") || null} />
          <Row label="Gender" value={chosen(GENDERS, profile.gender, profile.gender_custom)} />
          <Row label="Pronouns" value={[pronounLabel(profile.pronouns), profile.pronouns_custom].filter(Boolean).join(", ") || null} />
          <Row label="Home world" value={home} />
          <Row label="Jobs" value={profile.jobs} />
          {detailed && (
            <>
              <Row label="Orientation" value={chosen(ORIENTATIONS, profile.orientation, profile.orientation_custom)} />
              <Row label="Height" value={profile.height} />
              <Row label="Age" value={profile.age} />
              <Row label="Rates" value={profile.rates} />
              <Row label="Sync" value={profile.pairing_code ? `${sync ?? ""} ${profile.pairing_code}`.trim() : null} />
              <Row label="Likes" value={profile.likes} />
              <Row label="Dislikes" value={profile.dislikes} />
              <Row label="Personality" value={profile.personality} />
              <Row label="About" value={profile.about_me} />
            </>
          )}
        </dl>
        {detailed && profile.images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {profile.main_image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.main_image_url} alt="" className="h-20 w-20 rounded object-cover" />
            )}
            {profile.images.map((image) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={image.id} src={image.image_url} alt={image.caption ?? ""} className="h-20 w-20 rounded object-cover" />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
