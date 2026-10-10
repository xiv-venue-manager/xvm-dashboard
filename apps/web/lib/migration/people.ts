export interface ExportedUser {
  id: string
  name: string | null
  displayName: string | null
  discordId: string | null
  discordAccountId: string | null
  email: string | null
  isAdmin: boolean
  createdAt: string
  hasReferences: boolean
}

export interface PeopleExport {
  users: ExportedUser[]
  payees: string[]
}

export interface PersonRow {
  key: string
  kind: "user" | "payee"
  display_name: string
  is_platform_admin: boolean
  created_at: string | null
}

export interface AccountRow {
  person_key: string
  provider: "discord" | "email"
  external_id: string
  verified_at?: null
}

export interface PeopleResult {
  people: PersonRow[]
  discordAccounts: AccountRow[]
  emailAccounts: AccountRow[]
  skipped: { key: string; reason: string }[]
  warnings: { key: string; message: string }[]
}

const MAX_DISPLAY_NAME = 100
const SNOWFLAKE = /^\d{1,20}$/

const squash = (value: string) => value.trim().replace(/\s+/g, " ")

export function mapPeople(source: PeopleExport): PeopleResult {
  const result: PeopleResult = { people: [], discordAccounts: [], emailAccounts: [], skipped: [], warnings: [] }
  const warn = (key: string, message: string) => result.warnings.push({ key, message })
  const takenDiscord = new Set<string>()
  const takenEmail = new Set<string>()
  const userNames = new Map<string, string>()

  const users = [...source.users].sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  for (const user of users) {
    if (!user.hasReferences && !user.isAdmin) {
      result.skipped.push({ key: user.id, reason: "unreferenced" })
      continue
    }

    let displayName = squash(user.displayName ?? "") || squash(user.name ?? "")
    if (!displayName) {
      displayName = `User ${user.id.slice(-6)}`
      warn(user.id, "no display name or name, used a placeholder")
    }
    if (displayName.length > MAX_DISPLAY_NAME) {
      displayName = displayName.slice(0, MAX_DISPLAY_NAME)
      warn(user.id, `display name cut to ${MAX_DISPLAY_NAME} characters`)
    }

    result.people.push({
      key: user.id,
      kind: "user",
      display_name: displayName,
      is_platform_admin: user.isAdmin,
      created_at: user.createdAt,
    })
    userNames.set(displayName.toLowerCase(), user.id)

    if (user.discordAccountId && user.discordId && user.discordAccountId !== user.discordId) {
      warn(user.id, `discord id differs between accounts (${user.discordAccountId}) and users (${user.discordId}), used the account`)
    }
    const discord = user.discordAccountId ?? user.discordId
    if (discord === null) {
      warn(user.id, "no discord identity")
    } else if (!SNOWFLAKE.test(discord)) {
      warn(user.id, `discord id ${JSON.stringify(discord)} is not a snowflake, no account created`)
    } else if (takenDiscord.has(discord)) {
      warn(user.id, `discord id ${discord} already belongs to an earlier user, no account created`)
    } else {
      takenDiscord.add(discord)
      result.discordAccounts.push({ person_key: user.id, provider: "discord", external_id: discord })
    }

    const email = user.email?.trim().toLowerCase()
    if (email) {
      if (!email.includes("@")) {
        warn(user.id, `email ${JSON.stringify(email)} is not an address, no account created`)
      } else if (takenEmail.has(email)) {
        warn(user.id, `email ${email} already belongs to an earlier user, no account created`)
      } else {
        takenEmail.add(email)
        result.emailAccounts.push({ person_key: user.id, provider: "email", external_id: email, verified_at: null })
      }
    }
  }

  const seenPayees = new Set<string>()
  for (const raw of source.payees) {
    const name = squash(raw).slice(0, MAX_DISPLAY_NAME)
    if (!name) continue
    const folded = name.toLowerCase()
    if (seenPayees.has(folded)) continue
    seenPayees.add(folded)

    const key = `payee:${folded}`
    result.people.push({ key, kind: "payee", display_name: name, is_platform_admin: false, created_at: null })
    const sameAsUser = userNames.get(folded)
    if (sameAsUser) warn(key, `same name as user ${sameAsUser}, merge afterwards if they are one person`)
  }

  return result
}
