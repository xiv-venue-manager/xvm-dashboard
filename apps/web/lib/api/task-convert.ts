import { listTaskCategories, createTaskCategory, XvmApiError } from "./xvm-api"

// xvm-api's Task.priority is an int 0-3 (0=low..3=urgent, MAX_TASK_PRIORITY=3);
// Prisma's TaskPriority is the 4-value string enum every UI dropdown in this app
// already uses.
export type TaskPriorityLabel = "LOW" | "MEDIUM" | "HIGH" | "URGENT"

const PRIORITY_TO_INT: Record<TaskPriorityLabel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  URGENT: 3,
}
const INT_TO_PRIORITY: TaskPriorityLabel[] = ["LOW", "MEDIUM", "HIGH", "URGENT"]

export function priorityToInt(label: TaskPriorityLabel): number {
  return PRIORITY_TO_INT[label]
}

export function intToPriority(value: number): TaskPriorityLabel {
  const label = INT_TO_PRIORITY[value]
  if (!label) throw new Error(`Invalid task priority int: ${value}`)
  return label
}

// Find-or-create by case-insensitive name. A 409 from
// createTaskCategory means another request created it first between our
// list and create calls - refetch and use the now-existing one rather than
// treating it as a real error.
export async function resolveCategoryId(personToken: string, venueId: string, name: string): Promise<number> {
  const existing = await listTaskCategories(personToken, venueId)
  const match = existing.find((c) => c.name.toLowerCase() === name.toLowerCase())
  if (match) return match.id

  try {
    const created = await createTaskCategory(personToken, venueId, name)
    return created.id
  } catch (err) {
    if (err instanceof XvmApiError && err.status === 409) {
      const refetched = await listTaskCategories(personToken, venueId)
      const nowMatch = refetched.find((c) => c.name.toLowerCase() === name.toLowerCase())
      if (nowMatch) return nowMatch.id
    }
    throw err
  }
}
