import type { ShoutData } from "@/lib/api/xvm-api"

export interface ExportedShout {
  discord_id: string | null
  display_name: string | null
  label: string
  fields: Record<string, unknown>
  template_id: string
  separator_id: string | null
  decor_id: string | null
}

export interface PersonPlan {
  discordId: string
  displayName: string
  shouts: ShoutData[]
}

export type BackfillProblemReason = "no_discord_account" | "blank_label" | "duplicate_label"

export interface BackfillProblem {
  discordId: string | null
  label: string
  reason: BackfillProblemReason
}

export interface BackfillPlan {
  people: PersonPlan[]
  problems: BackfillProblem[]
}

export function planBackfill(rows: ExportedShout[]): BackfillPlan {
  const people = new Map<string, PersonPlan>()
  const seenLabels = new Map<string, Set<string>>()
  const problems: BackfillProblem[] = []

  for (const row of rows) {
    const label = row.label.trim()
    if (!row.discord_id) {
      problems.push({ discordId: null, label, reason: "no_discord_account" })
      continue
    }
    if (!label) {
      problems.push({ discordId: row.discord_id, label, reason: "blank_label" })
      continue
    }

    const seen = seenLabels.get(row.discord_id) ?? new Set<string>()
    if (seen.has(label.toLowerCase())) {
      problems.push({ discordId: row.discord_id, label, reason: "duplicate_label" })
      continue
    }
    seen.add(label.toLowerCase())
    seenLabels.set(row.discord_id, seen)

    const person = people.get(row.discord_id) ?? {
      discordId: row.discord_id,
      displayName: row.display_name?.trim() || "Unknown",
      shouts: [],
    }
    person.shouts.push({
      label,
      fields: row.fields,
      template_id: row.template_id,
      separator_id: row.separator_id ?? undefined,
      decor_id: row.decor_id ?? undefined,
    })
    people.set(row.discord_id, person)
  }

  return { people: [...people.values()], problems }
}
