export const TEAM_BIO_MAX = 1000

interface Groupable {
  group_label: string | null
}

export interface TeamSection<T extends Groupable> {
  label: string | null
  members: T[]
}

export function groupTeam<T extends Groupable>(members: T[]): TeamSection<T>[] {
  const labelled = new Map<string, T[]>()
  const unlabelled: T[] = []
  for (const member of members) {
    if (member.group_label === null) {
      unlabelled.push(member)
      continue
    }
    const bucket = labelled.get(member.group_label)
    if (bucket) bucket.push(member)
    else labelled.set(member.group_label, [member])
  }
  const sections: TeamSection<T>[] = [...labelled].map(([label, group]) => ({ label, members: group }))
  if (unlabelled.length > 0) sections.push({ label: null, members: unlabelled })
  return sections
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  const first = [...words[0]][0]
  const last = words.length > 1 ? [...words[words.length - 1]][0] : ""
  return (first + last).toUpperCase()
}
