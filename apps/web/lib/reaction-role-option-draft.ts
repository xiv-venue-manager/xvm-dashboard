import { SNOWFLAKE_PATTERN } from "@/lib/validation"

export interface DraftOption {
  roleId: string
  label: string
  emoji: string
}

// Mirrors xvm-api's MAX_REACTION_ROLE_OPTIONS.
export const MAX_PANEL_OPTIONS = 20

export function draftProblem(draft: DraftOption, takenRoleIds: string[]): string | null {
  if (!SNOWFLAKE_PATTERN.test(draft.roleId)) return "Role ID must be numeric."
  if (!draft.label.trim() && !draft.emoji.trim()) return "An option needs a label or an emoji."
  if (takenRoleIds.includes(draft.roleId)) return "That role is already on this panel."
  if (takenRoleIds.length >= MAX_PANEL_OPTIONS) return `A panel holds at most ${MAX_PANEL_OPTIONS} options.`
  return null
}

/** One at a time and in order, so the buttons keep the order they were added in. Never throws. */
export async function addInOrder<T, R>(
  items: T[],
  add: (item: T) => Promise<R>
): Promise<{ created: R[]; failed: { item: T; error: string }[] }> {
  const created: R[] = []
  const failed: { item: T; error: string }[] = []
  for (const item of items) {
    try {
      created.push(await add(item))
    } catch (err) {
      failed.push({ item, error: err instanceof Error ? err.message : "Failed to add option." })
    }
  }
  return { created, failed }
}
