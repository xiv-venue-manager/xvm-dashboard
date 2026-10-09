import { describe, it, expect } from "vitest"
import {
  pickerProblem,
  offeredRoles,
  showsManualEntry,
  canReturnToList,
  memberQueryReady,
  memberSearchProblem,
  canReturnToSearch,
  initials,
  type DiscordOption,
} from "./discord-picker-state"

const role = (over: Partial<DiscordOption> = {}): DiscordOption => ({
  value: "100",
  label: "Bartender",
  color: 0,
  note: null,
  ...over,
})

describe("pickerProblem", () => {
  it("tells apart the four reasons a list can be missing", () => {
    expect(pickerProblem(409, { error: "not_linked" }).message).toMatch(/no discord server/i)
    expect(pickerProblem(409, { error: "bot_absent" }).message).toMatch(/bot isn't in/i)
    expect(pickerProblem(409, { error: "not_connected" }).message).toMatch(/xvm-api/i)
    expect(pickerProblem(403, {}).message).toMatch(/don't have access/i)
  })

  it("offers a retry only for a failure a retry could fix", () => {
    // Telling someone to try again when the bot is not in their server is a loop with no exit.
    expect(pickerProblem(409, { error: "not_linked" }).retryable).toBe(false)
    expect(pickerProblem(409, { error: "bot_absent" }).retryable).toBe(false)
    expect(pickerProblem(409, { error: "not_connected" }).retryable).toBe(false)
    expect(pickerProblem(403, {}).retryable).toBe(false)
    expect(pickerProblem(502, {}).retryable).toBe(true)
    expect(pickerProblem(500, {}).retryable).toBe(true)
  })

  it("prefers the server's own sentence for a transient failure", () => {
    expect(pickerProblem(502, { error: "Couldn't reach Discord. Try again in a moment." }).message).toBe(
      "Couldn't reach Discord. Try again in a moment."
    )
    expect(pickerProblem(503, { message: "xvm-api link not established yet" }).message).toBe(
      "xvm-api link not established yet"
    )
    expect(pickerProblem(500, {}).message).toBe("Couldn't reach Discord.")
  })
})

describe("offeredRoles", () => {
  it("drops the unsafe ones", () => {
    const offered = offeredRoles(
      [
        role({ value: "1", label: "Bartender" }),
        role({ value: "2", label: "Admin", note: "it has Administrator permission" }),
        role({ value: "3", label: "@everyone", note: "it's the @everyone role" }),
      ],
      ""
    )
    expect(offered.map((r) => r.label)).toEqual(["Bartender"])
  })

  it("keeps an unsafe role that this row already holds", () => {
    // Drop it and an uncontrolled select falls back to its first entry, so saving an unrelated
    // field on the same form silently rewrites the role. discord-rest.ts:183 has the same reasoning.
    const roles = [
      role({ value: "1", label: "Bartender" }),
      role({ value: "2", label: "Admin", note: "it has Administrator permission" }),
    ]
    expect(offeredRoles(roles, "2").map((r) => r.label)).toEqual(["Bartender", "Admin"])
  })

  it("keeps a safe role whose note is absent rather than null", () => {
    expect(offeredRoles([{ value: "1", label: "Bartender" }], "")).toHaveLength(1)
  })
})

describe("showsManualEntry", () => {
  const base = { requested: false, disabled: false, problem: null, loading: false, options: [role()], value: "100" }

  it("shows the dropdown when a list loaded and holds the saved value", () => {
    expect(showsManualEntry(base)).toBe(false)
  })

  it("shows the field when asked for, whatever else is true", () => {
    expect(showsManualEntry({ ...base, requested: true })).toBe(true)
  })

  it("shows the field when the list could not be loaded", () => {
    expect(showsManualEntry({ ...base, problem: { message: "x", retryable: true } })).toBe(true)
  })

  it("waits rather than flashing the field while still loading", () => {
    // Options are empty during the first fetch; switching to manual there would flip the control
    // under the person for as long as Discord takes to answer.
    expect(showsManualEntry({ ...base, loading: true, options: [], value: "" })).toBe(false)
  })

  it("shows the field when the list loaded empty, because a dropdown would be dead", () => {
    expect(showsManualEntry({ ...base, options: [], value: "" })).toBe(true)
  })

  it("shows the field when the saved value is not in the list", () => {
    // A <select> cannot represent this without looking like the field was cleared.
    expect(showsManualEntry({ ...base, value: "999" })).toBe(true)
  })

  it("shows the dropdown for an empty value against a real list", () => {
    expect(showsManualEntry({ ...base, value: "" })).toBe(false)
  })

  it("shows the field, not a dead dropdown, while disabled with nothing loaded", () => {
    // What a half-filled form looks like: the reaction-role dialog disables this until the panel
    // is saved. A greyed dropdown that will not open reads as broken; a greyed field reads as
    // "not yet", which is what the control it replaced did.
    expect(showsManualEntry({ ...base, disabled: true, loading: false, options: [], value: "" })).toBe(true)
  })

  it("keeps the dropdown through a momentary disable once a list has loaded", () => {
    // Mid-submit the dialog disables the row. The control must not change shape underneath.
    expect(showsManualEntry({ ...base, disabled: true })).toBe(false)
  })
})

describe("canReturnToList", () => {
  const listed = [role({ value: "100" })]

  it("offers the way back for an empty or listed value", () => {
    expect(canReturnToList(listed, "")).toBe(true)
    expect(canReturnToList(listed, "100")).toBe(true)
  })

  it("hides it while the value is not in the list", () => {
    // showsManualEntry would send the person straight back, so the button would do nothing.
    // Clearing the field is the way out, and it makes the button appear.
    expect(canReturnToList(listed, "123")).toBe(false)
    expect(showsManualEntry({ requested: false, disabled: false, problem: null, loading: false, options: listed, value: "123" })).toBe(true)
  })

  it("hides it when there is no list to go back to", () => {
    expect(canReturnToList([], "")).toBe(false)
  })
})

describe("memberQueryReady", () => {
  it("waits for two characters, ignoring surrounding space", () => {
    // Discord's member search is prefix-based and a one-letter query returns a page of strangers.
    expect(memberQueryReady("")).toBe(false)
    expect(memberQueryReady(" a ")).toBe(false)
    expect(memberQueryReady("ab")).toBe(true)
    expect(memberQueryReady(" ab ")).toBe(true)
  })
})

describe("memberSearchProblem", () => {
  it("treats the rate limit as retryable and says why", () => {
    // Search runs per keystroke, so hitting the limit is a normal way to fail and the next
    // keystroke is the retry.
    const problem = memberSearchProblem(429, {})
    expect(problem.retryable).toBe(true)
    expect(problem.message).toMatch(/too fast/i)
  })

  it("defers every other status to pickerProblem", () => {
    expect(memberSearchProblem(409, { error: "bot_absent" })).toEqual(pickerProblem(409, { error: "bot_absent" }))
    expect(memberSearchProblem(502, { error: "Couldn't reach Discord." })).toEqual(
      pickerProblem(502, { error: "Couldn't reach Discord." })
    )
  })
})

describe("canReturnToSearch", () => {
  it("offers the way back once the field is empty", () => {
    expect(canReturnToSearch("", null)).toBe(true)
  })

  it("hides it while the field holds something", () => {
    // The component cannot tell an id typed a moment ago from one loaded off a saved record:
    // `picked` is only set by choosing from a result list, never from the `value` prop. Clearing
    // would be fine for the first and silent data loss for the second, so emptying the field is
    // what reveals the button. canReturnToList resolves the same dilemma the same way.
    expect(canReturnToSearch("123456789012345678", null)).toBe(false)
  })

  it("hides it when searching could not work anyway", () => {
    expect(canReturnToSearch("", pickerProblem(409, { error: "bot_absent" }))).toBe(false)
    expect(canReturnToSearch("", pickerProblem(403, {}))).toBe(false)
  })

  it("keeps it for a failure the next keystroke could clear", () => {
    expect(canReturnToSearch("", memberSearchProblem(429, {}))).toBe(true)
  })
})

describe("initials", () => {
  it("takes two letters or digits, uppercased", () => {
    expect(initials("Bartender")).toBe("BA")
    expect(initials("42nd Street")).toBe("42")
  })

  it("skips decoration rather than rendering it", () => {
    expect(initials("\u2726 Mina \u2726")).toBe("MI")
  })

  it("still renders something for a name made entirely of symbols", () => {
    expect(initials("\u2726\u2726\u2726")).toBe("#")
  })
})
