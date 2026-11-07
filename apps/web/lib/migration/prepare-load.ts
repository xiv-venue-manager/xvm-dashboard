export type MappedFile = Record<string, unknown>
export type MappedFiles = Record<string, MappedFile>

type Row = Record<string, unknown>

export interface PrepareReport {
  dropped: Record<string, number>
  clearedPayrollLinks: number
}

export const LOAD_ARRAYS: Record<string, string[]> = {
  venues: ["venues", "externalLinks", "images"],
  positions: ["positions", "memberships", "membershipPositions"],
  services: ["categories", "services", "servicePositions", "inventories"],
  events: ["rules", "events", "totals"],
  shifts: ["shifts", "audits"],
  finance: ["transactions", "payroll"],
  patrons: ["patrons", "logs"],
  "follows-feedback": ["follows", "feedback"],
  "tasks-rooms": ["taskCategories", "tasks", "rooms"],
  hours: ["hours"],
  settings: ["payrollSettings", "modules"],
}

const CASCADES: { file: string; array: string; field: string; parent: [string, string] }[] = [
  { file: "events", array: "totals", field: "event_key", parent: ["events", "events"] },
  { file: "shifts", array: "audits", field: "shift_key", parent: ["shifts", "shifts"] },
  { file: "positions", array: "membershipPositions", field: "membership_key", parent: ["positions", "memberships"] },
  { file: "services", array: "servicePositions", field: "service_key", parent: ["services", "services"] },
  { file: "services", array: "inventories", field: "service_key", parent: ["services", "services"] },
]

const rowsOf = (files: MappedFiles, file: string, array: string): Row[] =>
  (files[file]?.[array] as Row[] | undefined) ?? []

export function prepareLoad(files: MappedFiles): { files: MappedFiles; report: PrepareReport } {
  if (!files.venues) throw new Error("venues-mapped is required: it decides which venues load")
  const allowed = new Set(rowsOf(files, "venues", "venues").map((v) => v.key as string))
  const report: PrepareReport = { dropped: {}, clearedPayrollLinks: 0 }
  const out: MappedFiles = {}

  for (const [file, arrays] of Object.entries(LOAD_ARRAYS)) {
    if (!files[file]) continue
    out[file] = { ...files[file] }
    for (const array of arrays) {
      const rows = rowsOf(files, file, array)
      const kept = rows.filter((r) => !("venue_key" in r) || allowed.has(r.venue_key as string))
      out[file][array] = kept
      if (kept.length !== rows.length) report.dropped[`${file}.${array}`] = rows.length - kept.length
    }
  }

  for (const { file, array, field, parent } of CASCADES) {
    if (!out[file]) continue
    const parentKeys = new Set(rowsOf(out, parent[0], parent[1]).map((r) => r.key as string))
    const rows = rowsOf(out, file, array)
    const kept = rows.filter((r) => parentKeys.has(r[field] as string))
    out[file][array] = kept
    const total = (report.dropped[`${file}.${array}`] ?? 0) + rows.length - kept.length
    if (total) report.dropped[`${file}.${array}`] = total
  }

  const payrollKeys = new Set(rowsOf(out, "finance", "payroll").map((r) => r.key as string))
  if (out.shifts) {
    out.shifts.shifts = rowsOf(out, "shifts", "shifts").map((s) => {
      if (s.payroll_entry_key == null || payrollKeys.has(s.payroll_entry_key as string)) return s
      report.clearedPayrollLinks++
      return { ...s, payroll_entry_key: null }
    })
  }

  return { files: out, report }
}
