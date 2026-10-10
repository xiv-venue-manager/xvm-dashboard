export interface ExportedPatron {
  id: string
  venueId: string
  characterName: string
  world: string
  isBanned: boolean
  banReason: string | null
  bannedAt: string | null
  bannedById: string | null
  createdAt: string
}

export interface ExportedPatronLog {
  id: string
  venueId: string
  eventId: string | null
  characterName: string | null
  world: string | null
  action: string
  countChange: number | null
  loggedBy: string | null
  timestamp: string
  loggedAt: string
  wasWorking: boolean
  workingUserId: string | null
  reclassifiedAt: string | null
  reclassifiedById: string | null
  reclassifyReason: string | null
}

export interface PatronsExport {
  patrons: ExportedPatron[]
  logs: ExportedPatronLog[]
}

export interface PatronsContext {
  personKeys: ReadonlySet<string>
  eventKeys: ReadonlySet<string>
}

export interface PatronRow {
  key: string
  venue_key: string
  character_name: string
  world: string
  ban_reason: string | null
  banned_at: string | null
  banned_by_person_key: string | null
  created_at: string
}

export interface PatronLogRow {
  key: string
  venue_key: string
  event_key: string | null
  character_name: string | null
  world: string | null
  action: "enter" | "leave" | "present"
  count_change: number | null
  logged_by_person_key: string | null
  ts: string
  logged_at: string
  was_working: boolean
  working_person_key: string | null
  reclassified_at: string | null
  reclassified_by_person_key: string | null
  reclassify_reason: string | null
}

export interface PatronsResult {
  patrons: PatronRow[]
  logs: PatronLogRow[]
  skipped: { key: string; reason: string }[]
  warnings: { key: string; message: string }[]
}

const MAX_NAME = 32
const MAX_BAN_REASON = 100
const MAX_RECLASSIFY_REASON = 100
const ACTIONS: Record<string, PatronLogRow["action"]> = { ENTER: "enter", LEAVE: "leave", EXIT: "leave", PRESENT: "present" }

const squash = (value: string) => value.trim().replace(/\s+/g, " ")

export function mapPatrons(source: PatronsExport, ctx: PatronsContext): PatronsResult {
  const result: PatronsResult = { patrons: [], logs: [], skipped: [], warnings: [] }
  const skip = (key: string, reason: string) => result.skipped.push({ key, reason })
  const warn = (key: string, message: string) => result.warnings.push({ key, message })

  const taken = new Set<string>()
  let clearedBans = 0

  for (const p of [...source.patrons].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
    const name = squash(p.characterName)
    const world = squash(p.world)
    if (!name || !world) {
      skip(p.id, "blank name or world")
      continue
    }
    if (name.length > MAX_NAME || world.length > MAX_NAME) {
      skip(p.id, `name or world over ${MAX_NAME} characters`)
      continue
    }
    const identity = `${p.venueId}|${name.toLowerCase()}|${world.toLowerCase()}`
    if (taken.has(identity)) {
      skip(p.id, "same character and world as an earlier patron at this venue, ignoring case")
      continue
    }
    taken.add(identity)

    let bannedAt: string | null = null
    let reason: string | null = null
    let bannedBy: string | null = null
    if (p.isBanned) {
      bannedAt = p.bannedAt ?? p.createdAt
      if (p.bannedAt === null) warn(p.id, "banned with no ban date, dated by when the patron was created")
      reason = p.banReason === null ? null : p.banReason.trim().slice(0, MAX_BAN_REASON) || null
      if (p.banReason !== null && p.banReason.trim().length > MAX_BAN_REASON) warn(p.id, `ban reason cut to ${MAX_BAN_REASON} characters`)
      bannedBy = p.bannedById !== null && ctx.personKeys.has(p.bannedById) ? p.bannedById : null
    } else if (p.bannedAt !== null || p.banReason !== null || p.bannedById !== null) {
      clearedBans++
    }

    result.patrons.push({
      key: p.id,
      venue_key: p.venueId,
      character_name: name,
      world,
      ban_reason: reason,
      banned_at: bannedAt,
      banned_by_person_key: bannedBy,
      created_at: p.createdAt,
    })
  }

  let eventsMissing = 0
  let reclassificationsDropped = 0
  let zeroFixed = 0

  for (const l of [...source.logs].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id))) {
    const action = ACTIONS[l.action]
    if (!action) {
      skip(l.id, `unknown action ${JSON.stringify(l.action)}`)
      continue
    }
    const name = l.characterName === null ? "" : squash(l.characterName)
    const world = l.world === null ? "" : squash(l.world)
    if (!name && l.countChange === 0) {
      skip(l.id, "no character and a count of 0, it carries nothing")
      continue
    }
    if (name.length > MAX_NAME || world.length > MAX_NAME) {
      skip(l.id, `name or world over ${MAX_NAME} characters`)
      continue
    }
    if (!name && l.countChange === null) {
      skip(l.id, "no character and no count")
      continue
    }

    let count = l.countChange
    if (count === 0 && action !== "present") {
      count = action === "enter" ? 1 : -1
      zeroFixed++
    }

    let reclassifiedAt: string | null = null
    let reclassifiedBy: string | null = null
    if (l.reclassifiedAt !== null || l.reclassifiedById !== null) {
      if (l.reclassifiedAt !== null && l.reclassifiedById !== null && ctx.personKeys.has(l.reclassifiedById)) {
        reclassifiedAt = l.reclassifiedAt
        reclassifiedBy = l.reclassifiedById
      } else {
        reclassificationsDropped++
      }
    }
    let reclassifyReason = reclassifiedAt === null || l.reclassifyReason === null ? null : l.reclassifyReason.trim() || null
    if (reclassifyReason !== null && reclassifyReason.length > MAX_RECLASSIFY_REASON) {
      reclassifyReason = reclassifyReason.slice(0, MAX_RECLASSIFY_REASON)
      warn(l.id, `reclassify reason cut to ${MAX_RECLASSIFY_REASON} characters`)
    }

    let eventKey: string | null = null
    if (l.eventId !== null) {
      if (ctx.eventKeys.has(l.eventId)) eventKey = l.eventId
      else eventsMissing++
    }

    result.logs.push({
      key: l.id,
      venue_key: l.venueId,
      event_key: eventKey,
      character_name: name || null,
      world: world || null,
      action,
      count_change: count,
      logged_by_person_key: l.loggedBy !== null && ctx.personKeys.has(l.loggedBy) ? l.loggedBy : null,
      ts: l.timestamp,
      logged_at: l.loggedAt,
      was_working: l.wasWorking,
      working_person_key: l.workingUserId !== null && ctx.personKeys.has(l.workingUserId) ? l.workingUserId : null,
      reclassified_at: reclassifiedAt,
      reclassified_by_person_key: reclassifiedBy,
      reclassify_reason: reclassifyReason,
    })
  }

  if (clearedBans > 0) warn("patrons", `${clearedBans} unbanned patrons still had ban data, cleared because xvm-api reads any ban date as banned`)
  if (reclassificationsDropped > 0) warn("logs", `${reclassificationsDropped} reclassifications dropped, xvm-api needs both the time and the person`)
  if (eventsMissing > 0) warn("logs", `${eventsMissing} logs pointed at an event that was not loaded, left without an event`)
  if (zeroFixed > 0) warn("logs", `${zeroFixed} logs had a count of 0, set to +1 for an entry or -1 for an exit so occupancy counts them`)

  return result
}
