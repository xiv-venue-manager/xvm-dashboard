export interface DiscordName {
  global_name: string
  username: string
  status: string
}

export interface NamedPeople {
  people: { key: string; display_name: string }[]
  discordAccounts: { person_key: string; provider: string; external_id: string }[]
}

const PLACEHOLDER = /^Discord user \d+$/

export function applyDiscordNames<T extends NamedPeople>(file: T, names: Record<string, DiscordName>) {
  const idByPerson = new Map(file.discordAccounts.filter((a) => a.provider === "discord").map((a) => [a.person_key, a.external_id]))
  const unresolved: string[] = []
  let named = 0
  const people = file.people.map((p) => {
    if (!PLACEHOLDER.test(p.display_name)) return p
    const found = names[idByPerson.get(p.key) ?? p.display_name.split(" ").pop()!]
    const name = found?.status === "ok" ? found.global_name || found.username : ""
    if (!name) {
      unresolved.push(p.display_name)
      return p
    }
    named++
    return { ...p, display_name: name }
  })
  return { file: { ...file, people }, named, unresolved }
}
