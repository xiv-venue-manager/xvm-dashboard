export const TEAM_BIO_MAX = 1000
export const TEAM_CACHE_TAG = "team"

interface Groupable {
  group: string
}

export interface TeamSection<T extends Groupable> {
  name: string
  members: T[]
}

export function groupTeam<T extends Groupable>(members: T[]): TeamSection<T>[] {
  const sections = new Map<string, T[]>()
  for (const member of members) {
    const bucket = sections.get(member.group)
    if (bucket) bucket.push(member)
    else sections.set(member.group, [member])
  }
  return [...sections].map(([name, group]) => ({ name, members: group }))
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  const first = [...words[0]][0]
  const last = words.length > 1 ? [...words[words.length - 1]][0] : ""
  return (first + last).toUpperCase()
}
