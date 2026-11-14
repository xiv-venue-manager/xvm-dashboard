export const ACTIVITY_PAGE_SIZE = 50

export const ACTIVITY_MODULES = [
  "events",
  "finance",
  "forms",
  "inventory",
  "memberships",
  "profiles",
  "quoteboard",
  "rooms",
  "shifts",
] as const

export type ActivityModule = (typeof ACTIVITY_MODULES)[number]

export const ACTIVITY_MODULE_LABELS: Record<ActivityModule, string> = {
  events: "Events",
  finance: "Finance",
  forms: "Forms",
  inventory: "Inventory",
  memberships: "Staff",
  profiles: "Profiles",
  quoteboard: "Quote board",
  rooms: "Rooms",
  shifts: "Shifts",
}

export const ACTIVITY_SOURCE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  bot: "Discord bot",
  plugin: "Plugin",
  worker: "Automatic",
}

function parseDay(day: string): [number, number, number] {
  const [year, month, date] = day.split("-").map(Number)
  return [year, month - 1, date]
}

export function dayStartIso(day: string): string {
  const [year, month, date] = parseDay(day)
  return new Date(year, month, date, 0, 0, 0, 0).toISOString()
}

export function dayEndIso(day: string): string {
  const [year, month, date] = parseDay(day)
  return new Date(year, month, date, 23, 59, 59, 999).toISOString()
}

export function oldestCreatedAt(rows: { created_at: string }[]): string | null {
  return rows.length === 0 ? null : rows[rows.length - 1].created_at
}

export function hasMoreActivity(received: number): boolean {
  return received >= ACTIVITY_PAGE_SIZE
}

export function appendOlder<T extends { id: number }>(shown: T[], older: T[]): T[] {
  const seen = new Set(shown.map((row) => row.id))
  return [...shown, ...older.filter((row) => !seen.has(row.id))]
}

export function isApplicableDay(value: string): boolean {
  if (value === "") return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, date] = parseDay(value)
  if (year < 2000 || year > 2100) return false
  const parsed = new Date(year, month, date)
  return parsed.getFullYear() === year && parsed.getMonth() === month && parsed.getDate() === date
}
