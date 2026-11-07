import type { MappedFiles } from "./prepare-load"

type Row = Record<string, unknown>

export interface DanglingRef {
  where: string
  field: string
  count: number
  sample: string
}

type Target = [file: string, array: string]

const PERSON: Target = ["people", "people"]
const MEMBERSHIP: Target = ["positions", "memberships"]
const POSITION: Target = ["positions", "positions"]

const REFS: { file: string; array: string; field: string; target: Target }[] = [
  ...[
    ["positions", "positions"], ["positions", "memberships"], ["services", "categories"], ["services", "services"],
    ["events", "rules"], ["events", "events"], ["shifts", "event_positions"], ["shifts", "event_shifts"], ["shifts", "shifts"],
    ["finance", "transactions"], ["finance", "payroll"], ["patrons", "patrons"], ["patrons", "logs"],
    ["follows-feedback", "follows"], ["tasks-rooms", "taskCategories"], ["tasks-rooms", "tasks"], ["tasks-rooms", "rooms"],
    ["hours", "hours"], ["settings", "payrollSettings"], ["settings", "modules"], ["venues", "externalLinks"], ["venues", "images"],
  ].map(([file, array]) => ({ file, array, field: "venue_key", target: ["venues", "venues"] as Target })),
  { file: "positions", array: "membershipPositions", field: "membership_key", target: MEMBERSHIP },
  { file: "positions", array: "membershipPositions", field: "position_key", target: POSITION },
  { file: "services", array: "servicePositions", field: "service_key", target: ["services", "services"] },
  { file: "services", array: "servicePositions", field: "position_key", target: POSITION },
  { file: "services", array: "inventories", field: "service_key", target: ["services", "services"] },
  { file: "services", array: "services", field: "category_key", target: ["services", "categories"] },
  { file: "events", array: "events", field: "rule_key", target: ["events", "rules"] },
  { file: "events", array: "totals", field: "event_key", target: ["events", "events"] },
  { file: "shifts", array: "event_positions", field: "event_key", target: ["events", "events"] },
  { file: "shifts", array: "event_positions", field: "position_key", target: POSITION },
  { file: "shifts", array: "event_shifts", field: "event_position_key", target: ["shifts", "event_positions"] },
  { file: "shifts", array: "shifts", field: "event_shift_key", target: ["shifts", "event_shifts"] },
  { file: "shifts", array: "shifts", field: "membership_key", target: MEMBERSHIP },
  { file: "shifts", array: "shifts", field: "position_key", target: POSITION },
  { file: "shifts", array: "shifts", field: "event_key", target: ["events", "events"] },
  { file: "shifts", array: "shifts", field: "payroll_entry_key", target: ["finance", "payroll"] },
  { file: "shifts", array: "audits", field: "shift_key", target: ["shifts", "shifts"] },
  { file: "finance", array: "transactions", field: "event_key", target: ["events", "events"] },
  { file: "finance", array: "transactions", field: "service_key", target: ["services", "services"] },
  { file: "finance", array: "transactions", field: "membership_key", target: MEMBERSHIP },
  { file: "finance", array: "payroll", field: "membership_key", target: MEMBERSHIP },
  { file: "patrons", array: "logs", field: "event_key", target: ["events", "events"] },
  { file: "tasks-rooms", array: "tasks", field: "category_key", target: ["tasks-rooms", "taskCategories"] },
  { file: "tasks-rooms", array: "tasks", field: "assigned_membership_key", target: MEMBERSHIP },
  { file: "tasks-rooms", array: "tasks", field: "assigned_position_key", target: POSITION },
  { file: "tasks-rooms", array: "rooms", field: "owner_membership_key", target: MEMBERSHIP },
]

const PERSON_ARRAYS: Target[] = [
  ["positions", "memberships"], ["events", "events"], ["shifts", "shifts"], ["shifts", "audits"], ["finance", "transactions"],
  ["finance", "payroll"], ["patrons", "patrons"], ["patrons", "logs"], ["follows-feedback", "follows"], ["follows-feedback", "feedback"],
  ["tasks-rooms", "tasks"], ["tasks-rooms", "rooms"], ["venues", "externalLinks"], ["people", "discordAccounts"],
  ["people", "emailAccounts"], ["characters", "characters"],
]

const rowsOf = (files: MappedFiles, [file, array]: Target): Row[] => (files[file]?.[array] as Row[] | undefined) ?? []

export function checkReferences(files: MappedFiles): DanglingRef[] {
  const found: DanglingRef[] = []
  const check = (file: string, array: string, field: string, target: Target) => {
    const keys = new Set(rowsOf(files, target).map((r) => r.key as string))
    const bad = rowsOf(files, [file, array]).filter((r) => r[field] != null && !keys.has(r[field] as string))
    if (bad.length) found.push({ where: `${file}.${array}`, field, count: bad.length, sample: String(bad[0][field]) })
  }
  for (const { file, array, field, target } of REFS) check(file, array, field, target)
  for (const [file, array] of PERSON_ARRAYS) {
    const fields = new Set(rowsOf(files, [file, array]).flatMap((r) => Object.keys(r).filter((k) => k.endsWith("person_key"))))
    for (const field of fields) check(file, array, field, PERSON)
  }
  return found
}
