import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { findDrift, type OpenApiContract } from "./contract-drift"

const contract = JSON.parse(
  readFileSync(new URL("./contract/openapi.json", import.meta.url), "utf8")
) as OpenApiContract
const mirror = readFileSync(new URL("./xvm-api.ts", import.meta.url), "utf8")

const ALIASES: Record<string, string> = {
  RuleRow: "api__schemas__hours__RuleRow",
  ReactionRoleOptionRow: "OptionRow",
  TemplateRow: "api__schemas__reactionroles__TemplateRow",
  PanelCreateData: "PanelCreate",
  PanelUpdateData: "PanelUpdate",
  PanelOptionCreateData: "OptionCreate",
  PanelOptionUpdateData: "OptionUpdate",
  TemplateOptionCreateData: "TemplateOptionCreate",
  TemplateCreateData: "api__schemas__reactionroles__TemplateCreate",
  VenueImage: "VenueImageRow",
  ListingSyncResult: "SyncResult",
  PublicPlatformStats: "PublicStats",
  ShiftAuditRow: "AuditRow",
  ShiftSettingsRow: "ShiftSettings",
  TaskCreateData: "TaskCreate",
  TaskUpdateData: "TaskUpdate",
  TaskAssignData: "TaskAssign",
  EventTemplateRow: "api__schemas__events__TemplateRow",
  EventTemplateCreateData: "api__schemas__events__TemplateCreate",
  EventTemplateUpdateData: "api__schemas__events__TemplateUpdate",
  EventCreateData: "EventCreate",
  EventSeriesCreateData: "EventSeriesCreate",
  EventSeriesRow: "EventSeries",
  EventUpdateData: "EventUpdate",
  EventSeriesEndData: "SeriesEnd",
  EventSeriesEnded: "SeriesEnded",
  VisitLogData: "VisitLog",
  PatronPresence: "Presence",
  VenueFollowers: "Followers",
  NotificationInbox: "Inbox",
  ReclassifyData: "Reclassify",
  FinanceSettingsRow: "PayrollSettingsRow",
  FinanceSettingsUpdate: "PayrollSettingsUpdate",
  FinanceTransactionRow: "TransactionRow",
  FinanceTransactionCreate: "TransactionCreate",
  FinanceTransactionUpdate: "TransactionUpdate",
  ServiceCategoryRow: "CategoryRow",
  ServiceCategoryCreate: "CategoryCreate",
  ServiceCategoryUpdate: "CategoryUpdate",
  ServiceInventoryRow: "InventoryRow",
  InventoryLinkInput: "InventoryLink",
  StockMovementCreateInput: "StockMovementCreate",
  AnnouncementData: "AnnouncementCreate",
  ShoutData: "ShoutCreate",
  FeedbackData: "FeedbackCreate",
  FeedbackTriageData: "FeedbackTriage",
  MyCharacterRow: "CharacterRow",
}

// Interfaces with no contract schema of their own. A new interface that is not mapped above has to be
// added here on purpose, so the unchecked part of the mirror cannot grow unnoticed.
const UNMAPPED = ["ShiftStaffOption"]

// Drift that is understood and not ours to fix here. Each entry must still occur, so a fix upstream
// makes this test ask for the entry to be removed.
const KNOWN_DRIFT: Record<string, string> = {}

describe("xvm-api.ts against the committed contract", () => {
  const report = findDrift(mirror, contract, ALIASES)
  const found = Object.fromEntries(report.drift.map((d) => [`${d.interface}.${d.property}`, d]))

  it("has no drift beyond the recorded entries", () => {
    const unexpected = Object.entries(found)
      .filter(([key]) => !(key in KNOWN_DRIFT))
      .map(([key, d]) => `${key} (${d.direction}): ${d.problem}`)
    expect(unexpected).toEqual([])
  })

  it("has no recorded drift that no longer occurs", () => {
    expect(Object.keys(KNOWN_DRIFT).filter((key) => !(key in found))).toEqual([])
  })

  it("lists every interface that has no contract schema", () => {
    expect(report.unmapped.sort()).toEqual(UNMAPPED)
  })

  it("maps only to schemas that exist", () => {
    const missing = Object.entries(ALIASES).filter(([, schema]) => !contract.components.schemas[schema])
    expect(missing).toEqual([])
  })
})

describe("findDrift", () => {
  const schema = (properties: Record<string, unknown>) => ({ type: "object", properties })
  const fixture = (schemas: Record<string, unknown>, bodies: string[] = []): OpenApiContract =>
    ({
      paths: {
        "/x": {
          post: {
            requestBody: {
              content: { "application/json": { schema: { $ref: `#/components/schemas/${bodies[0] ?? "None"}` } } },
            },
          },
        },
      },
      components: { schemas },
    }) as unknown as OpenApiContract

  it("flags a Discord id the API returns as a string but the mirror types as a number", () => {
    const contract = fixture({
      PositionRow: schema({ discord_role_id: { anyOf: [{ type: "string" }, { type: "null" }] } }),
    })
    const { drift } = findDrift("export interface PositionRow { discord_role_id: number | null }", contract)
    expect(drift.map((d) => d.problem)).toEqual(["contract can return string, the type omits it"])
  })

  it("accepts a string where a request takes an integer id", () => {
    const contract = fixture(
      { RuleCreate: schema({ channel_id: { anyOf: [{ type: "integer" }, { type: "null" }] } }) },
      ["RuleCreate"]
    )
    expect(findDrift("export interface RuleCreate { channel_id: string | null }", contract).drift).toEqual([])
  })

  it("still rejects a request value of a different kind", () => {
    const contract = fixture({ RuleCreate: schema({ count: { type: "boolean" } }) }, ["RuleCreate"])
    const { drift } = findDrift("export interface RuleCreate { count: string }", contract)
    expect(drift).toHaveLength(1)
  })

  it("flags a response the mirror narrows by dropping null", () => {
    const contract = fixture({ Summary: schema({ event_id: { anyOf: [{ type: "integer" }, { type: "null" }] } }) })
    expect(findDrift("export interface Summary { event_id: number }", contract).drift).toHaveLength(1)
  })

  it("resolves a type alias to the kinds it names", () => {
    const contract = fixture({ Row: schema({ status: { type: "string", enum: ["a", "b"] } }) })
    const source = `type Status = "a" | "b"\nexport interface Row { status: Status }`
    expect(findDrift(source, contract).drift).toEqual([])
  })

  it("flags a property the contract does not have", () => {
    const contract = fixture({ Row: schema({ a: { type: "string" } }) })
    expect(findDrift("export interface Row { a: string; b: string }", contract).drift).toHaveLength(1)
  })

  it("reports an interface with no schema as unmapped", () => {
    const contract = fixture({ Row: schema({ a: { type: "string" } }) })
    expect(findDrift("export interface Local { a: string }", contract).unmapped).toEqual(["Local"])
  })
})
