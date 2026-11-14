import { describe, it, expect } from "vitest"
import { AUDIT_LOG_EVENT_GROUPS, AUDIT_LOG_EVENT_KEYS, AUDIT_LOG_EVENT_LABELS, colorToHex, hexToColor } from "./audit-log-events"

const XVM_API_KEYS = [
  "message.deleted",
  "message.edited",
  "member.joined",
  "member.left",
  "member.name_changed",
  "member.avatar_changed",
  "member.banned",
  "member.unbanned",
  "member.timed_out",
  "member.timeout_removed",
  "channel.created",
  "channel.updated",
  "channel.deleted",
  "role.created",
  "role.updated",
  "role.deleted",
  "server.updated",
  "emoji.updated",
  "voice.joined",
  "voice.moved",
  "voice.left",
]

describe("audit log events", () => {
  it("lists exactly the event keys xvm-api accepts", () => {
    expect([...AUDIT_LOG_EVENT_KEYS].sort()).toEqual([...XVM_API_KEYS].sort())
  })

  it("puts every key in exactly one group and gives it a label", () => {
    const grouped = AUDIT_LOG_EVENT_GROUPS.flatMap((g) => g.keys)
    expect([...grouped].sort()).toEqual([...XVM_API_KEYS].sort())
    for (const key of AUDIT_LOG_EVENT_KEYS) expect(AUDIT_LOG_EVENT_LABELS[key]).toBeTruthy()
  })

  it("converts a colour between the stored integer and a hex string", () => {
    expect(colorToHex(0xff8800)).toBe("#ff8800")
    expect(colorToHex(0)).toBe("#000000")
    expect(hexToColor("#ff8800")).toBe(0xff8800)
    expect(hexToColor(colorToHex(0x00ccff))).toBe(0x00ccff)
  })

  it("shows a default when no colour is set", () => {
    expect(colorToHex(null)).toBe("#5865f2")
  })
})
