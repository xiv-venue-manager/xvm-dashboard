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
  minus?: Term[]
  keep?: (row: Record<string, unknown>) => boolean
  count?: (rows: unknown[], inputs: FroggeInputs) => number
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

export const VIP_ADDED = "current VIP members with no history row (started at the load)"

function currentHoldersWithoutOpenHistory(inputs: FroggeInputs): number {
  const history = inputs.exports.features?.vip_memberships
  const members = inputs.exports.features?.vip_members
  if (!Array.isArray(history) || !Array.isArray(members)) return 0
  const slot = (r: Record<string, unknown>) => `${r.guild_id}|${r.discord_user_id}`
  const open = new Set((history as Record<string, unknown>[]).filter((h) => !h.ended_at).map(slot))
  return (members as Record<string, unknown>[]).filter((m) => !open.has(slot(m))).length
}

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
    array: "finance_transactions",
    file: "staffing",
    mode: "equal",
    carried: [t("staffing-report", "finance transactions")],
    dropWhat: "finance transaction",
  },
  {
    array: "venue_links",
    file: "staffing",
    mode: "equal",
    carried: [t("staffing-report", "FFXIV Venues links")],
    dropWhat: "venue link",
    note: "the channel, message and snapshot are posted-message state and are not carried",
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
  {
    array: "vip_memberships",
    file: "features",
    mode: "equal",
    carried: [f("vipMemberships")],
    minus: [t("features-report", VIP_ADDED)],
    note: "the mapper also adds a row for each current holder with no open history row; those are counted under vip_members",
  },
  {
    array: "vip_members",
    file: "features",
    mode: "equal",
    carried: [t("features-report", VIP_ADDED)],
    count: (_, inputs) => currentHoldersWithoutOpenHistory(inputs),
    note: "a current holder with an open history row is carried through that row",
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
  {
    array: "profile_additional_images",
    file: "features",
    mode: "merged",
    carried: [o("profileImages")],
    note: "a gallery image with a blank address or a character that did not load is left out",
  },
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

export type FroggeTableSpec =
  | { kind: "exported"; array: string }
  | { kind: "retained"; note: string }
  | { kind: "not_carried"; decision: string }
  | { kind: "expect_empty" }
  | { kind: "undecided"; note: string }
  | { kind: "ignored" }

const notCarried = (decision: string): FroggeTableSpec => ({ kind: "not_carried", decision })

// Every table in Frogge's schema (107 at 2026-11-01). A table not listed here fails the run, so a new one has to be decided.
export const FROGGE_TABLES: Record<string, FroggeTableSpec> = {
  activity_logs: notCarried("mostly config-edit noise, dropped (fold-in decision 2026-11-01)"),
  admin_roles: notCarried(
    "role ids that make a member an admin: no xvm-api home, Frogge admin_users already give the owner and manager memberships"
  ),
  admin_users: { kind: "exported", array: "admin_users" },
  alembic_version: { kind: "ignored" },
  audit_log_settings: { kind: "exported", array: "audit_log_settings" },
  auto_reactor_rules: { kind: "exported", array: "auto_reactor_rules" },
  autorole_rules: notCarried("no xvm-api home, dropped (fold-in decision)"),
  card_booster_slots: { kind: "expect_empty" },
  card_breakdown_rarities: { kind: "expect_empty" },
  card_collections: { kind: "expect_empty" },
  card_crafting_recipes: { kind: "expect_empty" },
  card_daily_reward_tiers: { kind: "expect_empty" },
  card_economy_configs: notCarried("tuning for the card game, which has no xvm-api home"),
  card_ownerships: { kind: "expect_empty" },
  card_rarity_stat_bands: { kind: "expect_empty" },
  card_rarity_weights: { kind: "expect_empty" },
  card_series: { kind: "expect_empty" },
  cards: { kind: "expect_empty" },
  command_usages: notCarried("usage statistics, dropped (fold-in decision)"),
  custom_embed_fields: { kind: "exported", array: "custom_embed_fields" },
  custom_embed_post_requests: { kind: "expect_empty" },
  custom_embed_posts: { kind: "exported", array: "custom_embed_posts" },
  custom_embeds: { kind: "exported", array: "custom_embeds" },
  dashboard_whitelisted_users: notCarried("access list for Frogge's own dashboard, which retires"),
  entity_post_refreshes: { kind: "expect_empty" },
  event_positions: { kind: "exported", array: "event_positions" },
  event_post_requests: { kind: "expect_empty" },
  event_posts: notCarried(
    "posted Discord messages stay where they are, the bot token carries over (Allegro 2026-11-03)"
  ),
  event_recurrence_rules: { kind: "exported", array: "event_recurrence_rules" },
  event_shifts: { kind: "exported", array: "event_shifts" },
  event_signups: { kind: "exported", array: "event_signups" },
  event_templates: { kind: "exported", array: "event_templates" },
  events: { kind: "exported", array: "events" },
  finance_transaction_templates: notCarried(
    "seeded defaults, the same 10 rows for every server, dropped (fold-in decision)"
  ),
  finance_transactions: { kind: "exported", array: "finance_transactions" },
  finance_trigger_bindings: { kind: "expect_empty" },
  form_questions: { kind: "exported", array: "form_questions" },
  form_responses: { kind: "exported", array: "form_responses" },
  forms: { kind: "exported", array: "forms" },
  giveaway_entries: { kind: "exported", array: "giveaway_entries" },
  giveaway_post_requests: { kind: "expect_empty" },
  giveaways: { kind: "exported", array: "giveaways" },
  glyph_messages: { kind: "exported", array: "glyph_messages" },
  guild_configurations: { kind: "exported", array: "guild_configurations" },
  guild_subscriptions: notCarried("premium: xvm-api has no tiers, Allegro: nothing carries across (2026-11-03)"),
  guild_welcome_posts: notCarried(
    "posted Discord messages stay where they are, the bot token carries over (Allegro 2026-11-03)"
  ),
  guilds: { kind: "exported", array: "guilds" },
  interaction_usages: notCarried("usage statistics, dropped (fold-in decision)"),
  leveling_members: { kind: "exported", array: "leveling_members" },
  leveling_role_rewards: { kind: "exported", array: "leveling_role_rewards" },
  leveling_settings: { kind: "exported", array: "leveling_settings" },
  leveling_voice_sessions: { kind: "expect_empty" },
  message_template_components: { kind: "expect_empty" },
  message_templates: { kind: "exported", array: "message_templates" },
  pending_event_post_refreshes: { kind: "expect_empty" },
  pending_giveaway_finalizations: { kind: "expect_empty" },
  pending_raffle_finalizations: { kind: "expect_empty" },
  pending_vip_role_syncs: { kind: "expect_empty" },
  plugin_pairing_codes: notCarried("plugin users relink through the dashboard (plugin relink decision)"),
  plugin_tokens: notCarried("plugin users relink through the dashboard (plugin relink decision)"),
  plugin_user_guilds: notCarried("plugin sync state, plugin users relink through the dashboard"),
  positions: { kind: "exported", array: "positions" },
  profile_additional_images: { kind: "exported", array: "profile_additional_images" },
  profile_characters: { kind: "exported", array: "profile_characters" },
  profile_post_requests: { kind: "expect_empty" },
  profile_posts: notCarried(
    "posted Discord messages stay where they are, the bot token carries over (Allegro 2026-11-03)"
  ),
  quote_board_settings: { kind: "exported", array: "quote_board_settings" },
  quotes: { kind: "expect_empty" },
  raffle_entries: { kind: "exported", array: "raffle_entries" },
  raffle_post_requests: { kind: "expect_empty" },
  raffles: { kind: "exported", array: "raffles" },
  reaction_role_options: { kind: "exported", array: "reaction_role_options" },
  reaction_role_panel_post_requests: { kind: "expect_empty" },
  reaction_role_panel_posts: { kind: "exported", array: "reaction_role_panel_posts" },
  reaction_role_panels: { kind: "exported", array: "reaction_role_panels" },
  reaction_role_template_options: { kind: "exported", array: "reaction_role_template_options" },
  reaction_role_templates: { kind: "exported", array: "reaction_role_templates" },
  room_images: { kind: "expect_empty" },
  room_post_requests: { kind: "expect_empty" },
  rooms: { kind: "exported", array: "rooms" },
  staff_employment_periods: { kind: "exported", array: "employment_periods" },
  staff_member_positions: { kind: "exported", array: "staff_member_positions" },
  staff_members: { kind: "exported", array: "staff_members" },
  sticky_message_post_requests: { kind: "expect_empty" },
  sticky_messages: { kind: "exported", array: "sticky_messages" },
  stream_alert_notifications: { kind: "expect_empty" },
  time_clock_entries: { kind: "expect_empty" },
  tournament_entrants: { kind: "expect_empty" },
  tournament_matches: { kind: "expect_empty" },
  tournament_post_requests: { kind: "expect_empty" },
  tournaments: notCarried("no xvm-api home, dropped (fold-in decision)"),
  tracked_streams: { kind: "exported", array: "tracked_streams" },
  v2_reservations: { kind: "expect_empty" },
  v2_room_images: { kind: "expect_empty" },
  v2_rooms: { kind: "expect_empty" },
  v2_venues: { kind: "exported", array: "v2_venues" },
  venue_links: { kind: "exported", array: "venue_links" },
  venue_refresh_requests: { kind: "expect_empty" },
  verification_records: {
    kind: "retained",
    note: "frogge-verification.json, kept until Allegro builds the verification schema (decided 2026-11-03)",
  },
  verification_role_relations: notCarried("Allegro 2026-11-03: skip the role relations"),
  vip_display_posts: { kind: "exported", array: "vip_display_posts" },
  vip_members: { kind: "exported", array: "vip_members" },
  vip_memberships: { kind: "exported", array: "vip_memberships" },
  vip_perk_redemptions: { kind: "expect_empty" },
  vip_perks: { kind: "exported", array: "vip_perks" },
  vip_tiers: { kind: "exported", array: "vip_tiers" },
  webhook_deliveries: notCarried("a delivery log, nothing to carry"),
}

export interface FroggeCounts {
  tables: Record<string, number>
}

export function checkFroggeTables(
  counts: FroggeCounts,
  exports: FroggeInputs["exports"]
): { lines: FroggeLine[]; problems: string[] } {
  const lines: FroggeLine[] = []
  const problems: string[] = []
  const exportedRows = (array: string) => {
    for (const file of [exports.staffing, exports.features]) {
      const rows = file?.[array]
      if (Array.isArray(rows)) return rows.length
    }
    return undefined
  }
  for (const [table, rows] of Object.entries(counts.tables).sort(([a], [b]) => a.localeCompare(b))) {
    const spec = FROGGE_TABLES[table]
    if (!spec) {
      problems.push(`${table}: a Frogge table nobody has decided (${rows} rows)`)
      continue
    }
    switch (spec.kind) {
      case "exported": {
        const exported = exportedRows(spec.array)
        if (exported === undefined)
          problems.push(`${table}: ${rows} rows in Frogge and ${spec.array} is not in the export`)
        else if (exported > rows)
          problems.push(`${table}: ${exported} rows exported out of ${rows} in Frogge, more than exist`)
        lines.push({
          array: table,
          status: "carried",
          rowsIn: rows,
          rowsOut: exported ?? null,
          lost: 0,
          detail: "servers that are not loaded are left out",
        })
        break
      }
      case "retained":
        lines.push({ array: table, status: "not carried", rowsIn: rows, rowsOut: null, lost: 0, detail: spec.note })
        break
      case "not_carried":
        lines.push({ array: table, status: "not carried", rowsIn: rows, rowsOut: null, lost: 0, detail: spec.decision })
        break
      case "expect_empty":
        if (rows > 0) problems.push(`${table}: expected empty and has ${rows} rows`)
        break
      case "undecided":
        if (rows > 0) problems.push(`${table}: ${rows} rows and no decision yet (${spec.note})`)
        break
      case "ignored":
        break
    }
  }
  return { lines, problems }
}

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
    const subtracted = (rel.minus ?? []).reduce((sum, term) => sum + (value(term, inputs) ?? 0), 0)
    const out = (terms as number[]).reduce((a, b) => a + b, 0) - subtracted
    const rowCount = rel.count ? rel.count(rows, inputs) : rows.length
    const dropped = rel.dropWhat
      ? (inputs.reports.staffing?.dropped ?? []).filter((d) => d.what === rel.dropWhat).length
      : 0
    const ceiling = accepted[`frogge:${rel.array}`] ?? 0
    const gap = rowCount - out - dropped
    let lost = 0
    let detail = rel.note ?? ""
    if (rel.mode === "equal") {
      lost = Math.max(gap, 0)
      if (gap < 0) problems.push(`${rel.array}: ${out + dropped} rows out of ${rowCount} in, more than went in`)
    } else if (rel.mode === "atLeast") {
      if (out < rowCount) problems.push(`${rel.array}: ${rowCount} in but only ${out} came out`)
    } else {
      lost = Math.max(gap, 0)
      if (gap < 0) problems.push(`${rel.array}: ${out} out of ${rowCount} in, more than went in`)
    }
    if (dropped > 0) detail = `${dropped} dropped by the mapper${detail ? "; " + detail : ""}`
    const unaccounted = rel.mode === "atLeast" ? 0 : lost + dropped
    if (unaccounted > ceiling) problems.push(`${rel.array}: ${unaccounted} rows not carried, ${ceiling} accepted`)
    lines.push({
      array: rel.array,
      status: rel.mode === "merged" ? "merged" : "carried",
      rowsIn: rowCount,
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
