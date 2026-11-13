type Row = Record<string, unknown>

export interface FroggeVerificationExport {
  verification_records: {
    id: number
    guild_id: string
    discord_user_id: string
    character_name: string
    lodestone_id: number | string | null
    world: string
    verified_at: string
    proof_method: string
  }[]
  verification_settings: {
    guild_id: string
    require_captcha: boolean | null
    require_lodestone_proof: boolean | null
    require_lodestone_verification: boolean | null
    change_name: boolean | null
    verified_role_id: string | null
  }[]
}

export interface VerificationContext {
  venueKeyByGuild: Record<string, string>
  personByDiscord: ReadonlyMap<string, string>
}

export interface VerificationReport {
  counts: Record<string, number>
  dropped: { what: string; id: string; reason: string }[]
}

export interface VerificationResult {
  characters: Row[]
  discordSettings: Row[]
  report: VerificationReport
}

const MAX_LENGTH = 32
const VERIFIED_PROOF = "lodestone_code"

const squash = (value: string) => value.trim().replace(/\s+/g, " ")
const identity = (name: string, world: string) => `${name.toLowerCase()}|${world.toLowerCase()}`

export function mapFroggeVerification(
  source: FroggeVerificationExport,
  ctx: VerificationContext,
  characters: Row[],
  discordSettings: Row[]
): VerificationResult {
  const report: VerificationReport = { counts: {}, dropped: [] }
  const bump = (what: string) => (report.counts[what] = (report.counts[what] ?? 0) + 1)
  const drop = (what: string, id: string, reason: string) => report.dropped.push({ what, id, reason })

  const outCharacters = characters.map((c) => ({ ...c }))
  const byIdentity = new Map<string, Row>()
  const ownerOfLodestone = new Map<string, string>()
  for (const row of outCharacters) {
    byIdentity.set(`${row.person_key}|${identity(row.character_name as string, row.world as string)}`, row)
    if (row.lodestone_id != null) ownerOfLodestone.set(String(row.lodestone_id), row.person_key as string)
  }

  const records = source.verification_records
    .filter((r) => r.proof_method === VERIFIED_PROOF)
    .sort((a, b) => a.verified_at.localeCompare(b.verified_at) || a.id - b.id)
  for (const record of records) {
    const id = String(record.id)
    if (record.lodestone_id == null) {
      drop("verified characters", id, "no Lodestone id")
      continue
    }
    const person = ctx.personByDiscord.get(record.discord_user_id)
    if (!person) {
      drop("verified characters", id, "person not loaded")
      continue
    }
    const name = squash(record.character_name)
    const world = squash(record.world)
    if (!name || !world || name.length > MAX_LENGTH || world.length > MAX_LENGTH) {
      drop("verified characters", id, `blank, or over ${MAX_LENGTH} characters`)
      continue
    }
    const lodestone = String(record.lodestone_id)
    const owner = ownerOfLodestone.get(lodestone)
    if (owner !== undefined) {
      drop(
        "verified characters",
        id,
        owner === person ? "same Lodestone character already verified" : "Lodestone character already verified by someone else"
      )
      continue
    }
    const held = byIdentity.get(`${person}|${identity(name, world)}`)
    if (held) {
      held.verified_via = "lodestone"
      held.lodestone_id = lodestone
      held.verified_at = record.verified_at
      bump("existing characters upgraded to verified")
    } else {
      const row = {
        person_key: person,
        character_name: name,
        world,
        is_primary: false,
        verified_via: "lodestone",
        lodestone_id: lodestone,
        verified_at: record.verified_at,
      }
      outCharacters.push(row)
      byIdentity.set(`${person}|${identity(name, world)}`, row)
      bump("verified characters added")
    }
    ownerOfLodestone.set(lodestone, person)
  }

  const outSettings = discordSettings.map((s) => ({ ...s }))
  for (const settings of source.verification_settings) {
    const venueKey = ctx.venueKeyByGuild[settings.guild_id]
    if (!venueKey) continue
    const lodestone = settings.require_lodestone_proof ? "code" : settings.require_lodestone_verification ? "exists" : "off"
    const captcha = settings.require_captcha === true
    const roleId = settings.verified_role_id || null
    if (roleId === null) {
      bump("servers left at Frogge's defaults, which are not a choice")
      continue
    }
    let nickname = settings.change_name === true
    if (nickname && lodestone === "off") {
      drop("verification settings", settings.guild_id, "changes names to the Lodestone's, but no Lodestone check is on")
      nickname = false
    }
    const fields = {
      verification_lodestone: lodestone,
      verification_captcha: captcha,
      verification_nickname: nickname,
      verified_role_id: roleId,
    }
    const row = outSettings.find((s) => s.venue_key === venueKey)
    if (row) Object.assign(row, fields)
    else outSettings.push({ venue_key: venueKey, ...fields })
    bump("verification settings")
  }

  return { characters: outCharacters, discordSettings: outSettings, report }
}
