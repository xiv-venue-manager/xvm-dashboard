import { gilToMinorUnits, hexColorToInt } from "../api/position-convert"

export interface ExportedRole {
  id: string
  venueId: string
  name: string
  color: string | null
  responsibilities: string | null
  hourlyRate: number | null
  hasPermissions: boolean
  potPayoutMode: "STANDARD" | "POT" | "CONTRACTOR"
  contractorSharesPot: boolean
  createdAt: string
}

export interface ExportedMembership {
  id: string
  userId: string | null
  venueId: string
  role: "OWNER" | "MANAGER" | "STAFF"
  roleId: string | null
  hireDate: string
  status: string
  nickname: string | null
  hourlyRate: number | null
  tipPooled: boolean | null
  temporaryRole: string | null
  createdAt: string
  additionalRoleIds: string[]
}

export interface PositionsExport {
  roles: ExportedRole[]
  memberships: ExportedMembership[]
}

export interface PositionRow {
  key: string
  venue_key: string
  name: string
  color: number | null
  responsibilities: string | null
  hourly_rate_minor: number | null
  pot_payout_mode: "standard" | "pot" | "contractor"
  contractor_shares_pot: boolean
}

export interface MembershipRow {
  key: string
  venue_key: string
  person_key: string
  tier: "owner" | "manager" | "staff"
  nickname: string | null
  tip_pooled: boolean | null
  created_at: string
  employment_period: { started_at: string; ended_at: null }
}

export interface MembershipPositionRow {
  membership_key: string
  position_key: string
}

export interface PositionsResult {
  positions: PositionRow[]
  memberships: MembershipRow[]
  membershipPositions: MembershipPositionRow[]
  skipped: { key: string; reason: string }[]
  warnings: { key: string; message: string }[]
}

const MAX_NAME = 100
const MAX_RESPONSIBILITIES = 500

const squash = (value: string) => value.trim().replace(/\s+/g, " ")

export function mapPositions(source: PositionsExport, personKeys: ReadonlySet<string>): PositionsResult {
  const result: PositionsResult = { positions: [], memberships: [], membershipPositions: [], skipped: [], warnings: [] }
  const skip = (key: string, reason: string) => result.skipped.push({ key, reason })
  const warn = (key: string, message: string) => result.warnings.push({ key, message })

  const keptPosition = new Map<string, string>()
  const takenNames = new Set<string>()
  const roles = [...source.roles].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))

  for (const role of roles) {
    const name = squash(role.name)
    if (!name) {
      skip(role.id, "blank name")
      continue
    }
    if (name.length > MAX_NAME) {
      skip(role.id, `name over ${MAX_NAME} characters`)
      continue
    }
    const identity = `${role.venueId}|${name.toLowerCase()}`
    if (takenNames.has(identity)) {
      skip(role.id, "same name as an earlier role at this venue, ignoring case")
      continue
    }
    takenNames.add(identity)

    let color: number | null = null
    try {
      color = hexColorToInt(role.color)
    } catch {
      warn(role.id, `malformed colour ${JSON.stringify(role.color)}, no colour`)
    }

    let responsibilities = role.responsibilities === null ? null : role.responsibilities.trim() || null
    if (responsibilities !== null && responsibilities.length > MAX_RESPONSIBILITIES) {
      responsibilities = responsibilities.slice(0, MAX_RESPONSIBILITIES)
      warn(role.id, `responsibilities cut to ${MAX_RESPONSIBILITIES} characters`)
    }

    if (role.hourlyRate !== null && !Number.isInteger(role.hourlyRate)) {
      warn(role.id, `hourly rate ${role.hourlyRate} rounded to a whole gil`)
    }
    if (role.hasPermissions) warn(role.id, "permissions dropped, xvm-api has no equivalent")

    keptPosition.set(role.id, role.venueId)
    result.positions.push({
      key: role.id,
      venue_key: role.venueId,
      name,
      color,
      responsibilities,
      hourly_rate_minor: gilToMinorUnits(role.hourlyRate),
      pot_payout_mode: role.potPayoutMode.toLowerCase() as PositionRow["pot_payout_mode"],
      contractor_shares_pot: role.contractorSharesPot,
    })
  }

  const takenMembers = new Set<string>()
  const members = [...source.memberships].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))

  for (const m of members) {
    if (m.status === "pending") {
      skip(m.id, "pending invite")
      continue
    }
    if (m.status !== "active") {
      skip(m.id, `status ${m.status}, needs a decision`)
      continue
    }
    if (m.userId === null) {
      skip(m.id, "no user")
      continue
    }
    if (!personKeys.has(m.userId)) {
      skip(m.id, "person not loaded")
      continue
    }
    const identity = `${m.venueId}|${m.userId}`
    if (takenMembers.has(identity)) {
      skip(m.id, "second membership for the same person at this venue")
      continue
    }
    takenMembers.add(identity)

    if (m.temporaryRole) warn(m.id, `temporary role ${m.temporaryRole} not migrated`)
    if (m.hourlyRate !== null) warn(m.id, `membership hourly rate ${m.hourlyRate} dropped, xvm-api has no home for it`)

    let nickname = m.nickname === null ? null : squash(m.nickname) || null
    if (nickname !== null && nickname.length > MAX_NAME) {
      nickname = nickname.slice(0, MAX_NAME)
      warn(m.id, `nickname cut to ${MAX_NAME} characters`)
    }

    result.memberships.push({
      key: m.id,
      venue_key: m.venueId,
      person_key: m.userId,
      tier: m.role.toLowerCase() as MembershipRow["tier"],
      nickname,
      tip_pooled: m.tipPooled,
      created_at: m.createdAt,
      employment_period: { started_at: m.hireDate, ended_at: null },
    })

    const wanted = new Set([...(m.roleId ? [m.roleId] : []), ...m.additionalRoleIds])
    for (const roleId of wanted) {
      const venue = keptPosition.get(roleId)
      if (venue === undefined) {
        skip(`${m.id}:${roleId}`, "position was not loaded")
      } else if (venue !== m.venueId) {
        skip(`${m.id}:${roleId}`, "position belongs to another venue")
      } else {
        result.membershipPositions.push({ membership_key: m.id, position_key: roleId })
      }
    }
  }

  return result
}
