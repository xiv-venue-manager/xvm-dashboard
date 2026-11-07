export type Term =
  | { from: "staffing-report" | "features-report" | "tools-report"; key: string }
  | { from: "features" | "tools"; key: string }
  | { from: "matched-venues" }

type Mode = "equal" | "atLeast" | "merged"

export interface FroggeRelation {
  array: string
  file: "staffing" | "features"
  mode: Mode
  carried: Term[]
  keep?: (row: Record<string, unknown>) => boolean
  dropWhat?: string
  note?: string
}

export interface FroggeNotCarried {
  array: string
  file: "staffing" | "features"
  decision: string
}

const t = (from: "staffing-report" | "features-report" | "tools-report", key: string): Term => ({ from, key })
const f = (key: string): Term => ({ from: "features", key })
const o = (key: string): Term => ({ from: "tools", key })

export const FROGGE_RELATIONS: FroggeRelation[] = [
  {
    array: "guilds",
    file: "staffing",
    mode: "equal",
    carried: [t("staffing-report", "venues created"), { from: "matched-venues" }],
  },
  {
    array: "events",
    file: "staffing",
    mode: "equal",
    carried: [t("staffing-report", "events created"), t("staffing-report", "events matched to ours")],
    dropWhat: "event",
  },
  {
    array: "event_positions",
    file: "staffing",
    mode: "equal",
    carried: [t("staffing-report", "event positions created")],
  },
  { array: "event_shifts", file: "staffing", mode: "equal", carried: [t("staffing-report", "event shifts created")] },
  {
    array: "event_signups",
    file: "staffing",
    mode: "equal",
    carried: [t("staffing-report", "shifts created")],
    dropWhat: "signup",
  },
  {
    array: "positions",
    file: "staffing",
    mode: "merged",
    carried: [t("staffing-report", "positions created")],
    note: "a position with the name of one the venue already has is reused, not created",
  },
  {
    array: "staff_member_positions",
    file: "staffing",
    mode: "merged",
    carried: [t("staffing-report", "position assignments created")],
    note: "an assignment the person already has is not repeated",
  },
  {
    array: "staff_members",
    file: "staffing",
    mode: "atLeast",
    carried: [t("staffing-report", "memberships created")],
    note: "every staff member gets a membership, owners and admins add more",
  },
  { array: "reaction_role_panels", file: "features", mode: "equal", carried: [f("reactionRolePanels")] },
  { array: "reaction_role_options", file: "features", mode: "equal", carried: [f("reactionRoleOptions")] },
  { array: "leveling_settings", file: "features", mode: "equal", carried: [f("levelingSettings")] },
  { array: "leveling_members", file: "features", mode: "equal", carried: [f("levelingMembers")] },
  { array: "leveling_role_rewards", file: "features", mode: "equal", carried: [f("levelingTiers")] },
  { array: "vip_tiers", file: "features", mode: "equal", carried: [f("vipTiers")] },
  { array: "vip_perks", file: "features", mode: "equal", carried: [f("vipPerks")] },
  { array: "vip_memberships", file: "features", mode: "equal", carried: [f("vipMemberships")] },
  {
    array: "vip_members",
    file: "features",
    mode: "atLeast",
    carried: [f("vipMemberships")],
    note: "the current holder is folded into the membership history",
  },
  {
    array: "audit_log_settings",
    file: "features",
    mode: "equal",
    carried: [f("auditLogSettings")],
    keep: (r) => Boolean(r.channel_id),
    note: "a row with no channel carries only its event switches, which load separately",
  },
  { array: "forms", file: "features", mode: "equal", carried: [o("forms")] },
  { array: "form_questions", file: "features", mode: "equal", carried: [o("formQuestions")] },
  { array: "form_responses", file: "features", mode: "equal", carried: [o("formResponses")] },
  { array: "giveaways", file: "features", mode: "equal", carried: [o("giveaways")] },
  { array: "giveaway_entries", file: "features", mode: "equal", carried: [o("giveawayEntries")] },
  { array: "raffles", file: "features", mode: "equal", carried: [o("raffles")] },
  { array: "raffle_entries", file: "features", mode: "equal", carried: [o("raffleEntries")] },
  { array: "sticky_messages", file: "features", mode: "equal", carried: [o("stickyMessages")] },
  { array: "tracked_streams", file: "features", mode: "equal", carried: [o("trackedStreams")] },
  {
    array: "quote_board_settings",
    file: "features",
    mode: "equal",
    carried: [o("quoteBoardSettings"), t("tools-report", "quote board rows with nothing set, skipped")],
  },
  { array: "custom_embeds", file: "features", mode: "equal", carried: [o("customEmbeds")] },
  { array: "custom_embed_fields", file: "features", mode: "equal", carried: [o("customEmbedFields")] },
  { array: "auto_reactor_rules", file: "features", mode: "equal", carried: [o("autoReactorRules")] },
  { array: "event_templates", file: "features", mode: "equal", carried: [o("eventTemplates")] },
  { array: "message_templates", file: "features", mode: "equal", carried: [o("messageTemplates")] },
  { array: "profile_characters", file: "features", mode: "equal", carried: [o("profiles")] },
  { array: "rooms", file: "features", mode: "equal", carried: [o("rooms")] },
  {
    array: "event_recurrence_rules",
    file: "features",
    mode: "equal",
    carried: [t("tools-report", "event series carried")],
  },
]

export const FROGGE_NOT_CARRIED: FroggeNotCarried[] = [
  { array: "reaction_role_panel_posts", file: "features", decision: "posted Discord messages are not carried yet" },
  { array: "custom_embed_posts", file: "features", decision: "posted Discord messages are not carried yet" },
  { array: "vip_display_posts", file: "features", decision: "posted Discord messages are not carried yet" },
  { array: "glyph_messages", file: "features", decision: "posted Discord messages are not carried yet" },
  { array: "reaction_role_templates", file: "features", decision: "xvm-api seeds the same platform templates" },
  { array: "reaction_role_template_options", file: "features", decision: "xvm-api seeds the same platform templates" },
  {
    array: "guild_configurations",
    file: "features",
    decision:
      "carried column by column into Discord, shift and venue settings; checked by the mapper tests, not by row count",
  },
  {
    array: "admin_users",
    file: "staffing",
    decision: "become owner and manager memberships; checked through the memberships count",
  },
  { array: "employment_periods", file: "staffing", decision: "become hire dates and end dates on the memberships" },
  { array: "v2_venues", file: "staffing", decision: "a hint for matching servers to venues, not data" },
]

export interface FroggeInputs {
  exports: { staffing?: Record<string, unknown>; features?: Record<string, unknown> }
  reports: {
    staffing?: { counts?: Record<string, number>; dropped?: { what: string }[]; matchedVenues?: unknown[] }
    features?: { counts?: Record<string, number> }
    tools?: { counts?: Record<string, number> }
  }
  mapped: { features?: Record<string, unknown>; tools?: Record<string, unknown> }
}

export interface FroggeLine {
  array: string
  status: "carried" | "merged" | "not carried"
  rowsIn: number
  rowsOut: number | null
  lost: number
  detail: string
}

export interface FroggeResult {
  lines: FroggeLine[]
  problems: string[]
}

const len = (v: unknown) => (Array.isArray(v) ? v.length : 0)

function value(term: Term, inputs: FroggeInputs): number | undefined {
  switch (term.from) {
    case "staffing-report":
      return inputs.reports.staffing?.counts?.[term.key] ?? 0
    case "features-report":
      return inputs.reports.features?.counts?.[term.key] ?? 0
    case "tools-report":
      return inputs.reports.tools?.counts?.[term.key] ?? 0
    case "features":
      return inputs.mapped.features ? len(inputs.mapped.features[term.key]) : undefined
    case "tools":
      return inputs.mapped.tools ? len(inputs.mapped.tools[term.key]) : undefined
    case "matched-venues":
      return len(inputs.reports.staffing?.matchedVenues)
  }
}

export function checkFrogge(inputs: FroggeInputs, accepted: Record<string, number> = {}): FroggeResult {
  const lines: FroggeLine[] = []
  const problems: string[] = []
  const rowsOf = (file: "staffing" | "features", array: string): unknown[] | undefined => {
    const source = inputs.exports[file]?.[array]
    return Array.isArray(source) ? source : undefined
  }

  const covered = new Set<string>()
  for (const rel of FROGGE_RELATIONS) {
    covered.add(`${rel.file}.${rel.array}`)
    const all = rowsOf(rel.file, rel.array)
    if (!all) {
      problems.push(`${rel.array}: not in the Frogge ${rel.file} export`)
      continue
    }
    const rows = rel.keep ? all.filter((r) => rel.keep!(r as Record<string, unknown>)) : all
    const terms = rel.carried.map((term) => value(term, inputs))
    if (terms.some((v) => v === undefined)) {
      problems.push(`${rel.array}: the mapper output for it is missing`)
      continue
    }
    const out = (terms as number[]).reduce((a, b) => a + b, 0)
    const dropped = rel.dropWhat
      ? (inputs.reports.staffing?.dropped ?? []).filter((d) => d.what === rel.dropWhat).length
      : 0
    const ceiling = accepted[`frogge:${rel.array}`] ?? 0
    const gap = rows.length - out - dropped
    let lost = 0
    let detail = rel.note ?? ""
    if (rel.mode === "equal") {
      lost = Math.max(gap, 0)
      if (gap < 0) problems.push(`${rel.array}: ${out + dropped} rows out of ${rows.length} in, more than went in`)
    } else if (rel.mode === "atLeast") {
      if (out < rows.length) problems.push(`${rel.array}: ${rows.length} in but only ${out} came out`)
    } else {
      lost = Math.max(gap, 0)
      if (gap < 0) problems.push(`${rel.array}: ${out} out of ${rows.length} in, more than went in`)
    }
    if (dropped > 0) detail = `${dropped} dropped by the mapper${detail ? "; " + detail : ""}`
    const unaccounted = rel.mode === "atLeast" ? 0 : lost + dropped
    if (unaccounted > ceiling) problems.push(`${rel.array}: ${unaccounted} rows not carried, ${ceiling} accepted`)
    lines.push({
      array: rel.array,
      status: rel.mode === "merged" ? "merged" : "carried",
      rowsIn: rows.length,
      rowsOut: out,
      lost: unaccounted,
      detail,
    })
  }

  for (const nc of FROGGE_NOT_CARRIED) {
    covered.add(`${nc.file}.${nc.array}`)
    const rows = rowsOf(nc.file, nc.array)
    lines.push({
      array: nc.array,
      status: "not carried",
      rowsIn: rows?.length ?? 0,
      rowsOut: null,
      lost: 0,
      detail: nc.decision,
    })
  }

  for (const file of ["staffing", "features"] as const) {
    for (const [array, rows] of Object.entries(inputs.exports[file] ?? {})) {
      if (Array.isArray(rows) && !covered.has(`${file}.${array}`)) {
        problems.push(`${array}: a Frogge ${file} array nobody has decided (${rows.length} rows)`)
      }
    }
  }
  return { lines, problems }
}

export function renderFrogge(result: FroggeResult): string {
  const out = ["Frogge: every exported row is carried, merged into an existing row, or deliberately not carried", ""]
  for (const l of result.lines) {
    const flow = l.rowsOut === null ? "" : ` -> ${l.rowsOut}`
    out.push(
      `   ${l.status.padEnd(12)} ${l.array.padEnd(32)} ${String(l.rowsIn).padStart(5)}${flow}${l.lost ? `   NOT CARRIED ${l.lost}` : ""}   ${l.detail}`
    )
  }
  out.push(
    "",
    result.problems.length ? `RESULT: ${result.problems.length} problems` : "RESULT: every Frogge row is accounted for"
  )
  for (const p of result.problems) out.push(`   - ${p}`)
  return out.join("\n")
}
