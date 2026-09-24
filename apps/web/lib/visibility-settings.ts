export interface VisibilityFields {
  taskVisibility: "all" | "assigned" | "assigned_unassigned"
  salesVisibility: "all" | "own" | "none"
  eventVisibility: "all" | "published"
}

const ALLOWED: { [K in keyof VisibilityFields]: readonly string[] } = {
  taskVisibility: ["all", "assigned", "assigned_unassigned"],
  salesVisibility: ["all", "own", "none"],
  eventVisibility: ["all", "published"],
}

export function readVisibility(data: Record<string, unknown>): VisibilityFields | null {
  if (data.visibilityDegraded) return null
  const read = (key: keyof VisibilityFields): string | null => {
    const value = data[key]
    if (value === undefined) return "all"
    return typeof value === "string" && ALLOWED[key].includes(value) ? value : null
  }
  const taskVisibility = read("taskVisibility")
  const salesVisibility = read("salesVisibility")
  const eventVisibility = read("eventVisibility")
  if (taskVisibility === null || salesVisibility === null || eventVisibility === null) return null
  return { taskVisibility, salesVisibility, eventVisibility } as VisibilityFields
}
