export interface ExportedCharacter {
  id: string
  userId: string
  characterName: string
  world: string
  isPrimary: boolean
  createdAt: string
}

export interface CharacterExport {
  characters: ExportedCharacter[]
}

export interface CharacterRow {
  person_key: string
  character_name: string
  world: string
  is_primary: boolean
  verified_via: "self_declared"
}

export interface CharactersResult {
  characters: CharacterRow[]
  skipped: { key: string; reason: string }[]
  warnings: { key: string; message: string }[]
}

const MAX_LENGTH = 32

const squash = (value: string) => value.trim().replace(/\s+/g, " ")

export function mapCharacters(source: CharacterExport, personKeys: ReadonlySet<string>): CharactersResult {
  const result: CharactersResult = { characters: [], skipped: [], warnings: [] }
  const skip = (key: string, reason: string) => result.skipped.push({ key, reason })
  const taken = new Set<string>()
  const byPerson = new Map<string, CharacterRow[]>()

  const rows = [...source.characters].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))

  for (const row of rows) {
    if (!personKeys.has(row.userId)) {
      skip(row.id, "person not loaded")
      continue
    }
    const name = squash(row.characterName)
    const world = squash(row.world)
    if (!name || !world) {
      skip(row.id, "blank name or world")
      continue
    }
    if (name.length > MAX_LENGTH || world.length > MAX_LENGTH) {
      skip(row.id, `name or world over ${MAX_LENGTH} characters`)
      continue
    }
    const identity = `${name.toLowerCase()}|${world.toLowerCase()}`
    if (taken.has(identity)) {
      skip(row.id, "same name and world as an earlier character, ignoring case")
      continue
    }
    taken.add(identity)

    const mapped: CharacterRow = {
      person_key: row.userId,
      character_name: name,
      world,
      is_primary: row.isPrimary,
      verified_via: "self_declared",
    }
    result.characters.push(mapped)
    byPerson.set(row.userId, [...(byPerson.get(row.userId) ?? []), mapped])
  }

  for (const [personKey, owned] of byPerson) {
    const primaries = owned.filter((c) => c.is_primary)
    if (primaries.length === 0) {
      owned[0].is_primary = true
      result.warnings.push({ key: personKey, message: "no primary character, made the oldest one primary" })
    } else if (primaries.length > 1) {
      for (const extra of primaries.slice(1)) extra.is_primary = false
      result.warnings.push({ key: personKey, message: `${primaries.length} primary characters, kept the oldest` })
    }
  }

  return result
}
