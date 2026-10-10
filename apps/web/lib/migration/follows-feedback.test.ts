import { describe, it, expect } from "vitest"
import { mapFollowsFeedback, type ExportedFeedback, type ExportedFollow, type FollowsFeedbackContext } from "./follows-feedback"

const follow = (over: Partial<ExportedFollow> = {}): ExportedFollow => ({
  id: "f1",
  userId: "u1",
  venueId: "v1",
  visibleToOperators: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
})

const feedback = (over: Partial<ExportedFeedback> = {}): ExportedFeedback => ({
  id: "b1",
  userId: "u1",
  category: "FEATURE_REQUEST",
  status: "NEW",
  subject: "Add a calendar",
  description: "It would help.",
  url: "https://example.test/dashboard",
  userAgent: "Mozilla/5.0",
  screenshot: null,
  adminNotes: null,
  reviewedBy: null,
  reviewedAt: null,
  createdAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-03T00:00:00.000Z",
  ...over,
})

const ctx = (over: Partial<FollowsFeedbackContext> = {}): FollowsFeedbackContext => ({
  personKeys: new Set(["u1", "u2"]),
  excludeFeedback: new Set(),
  ...over,
})

const run = (follows: ExportedFollow[], fb: ExportedFeedback[] = [], c: FollowsFeedbackContext = ctx()) =>
  mapFollowsFeedback({ follows, feedback: fb }, c)

describe("follows", () => {
  it("maps a follow with its visibility", () => {
    expect(run([follow({ visibleToOperators: true })]).follows).toEqual([
      { key: "f1", venue_key: "v1", person_key: "u1", visible_to_operators: true, created_at: "2026-01-01T00:00:00.000Z" },
    ])
  })

  it("skips a follow whose person was not loaded", () => {
    const r = run([follow({ userId: "ghost" })])
    expect(r.follows).toEqual([])
    expect(r.skipped).toEqual([{ key: "f1", reason: "person not loaded" }])
  })

  it("keeps the earlier of two follows of one venue by one person", () => {
    const r = run([follow({ id: "late", createdAt: "2026-03-01T00:00:00.000Z" }), follow({ id: "early" })])
    expect(r.follows.map((f) => f.key)).toEqual(["early"])
    expect(r.skipped[0].key).toBe("late")
  })

  it("lets one person follow several venues", () => {
    expect(run([follow({ id: "a" }), follow({ id: "b", venueId: "v2" })]).follows).toHaveLength(2)
  })
})

describe("feedback", () => {
  it("maps a report, lower-casing the category and status", () => {
    expect(run([], [feedback({ category: "BUG_REPORT", status: "UNDER_REVIEW" })]).feedback[0]).toMatchObject({
      key: "b1", person_key: "u1", category: "bug_report", status: "under_review", subject: "Add a calendar",
      url: "https://example.test/dashboard", user_agent: "Mozilla/5.0", reviewed_by_person_key: null,
    })
  })

  it("carries admin notes, the reviewer and the review time", () => {
    const r = run([], [feedback({ status: "COMPLETED", adminNotes: " done ", reviewedBy: "u2", reviewedAt: "2026-02-01T00:00:00.000Z" })])
    expect(r.feedback[0]).toMatchObject({ admin_notes: "done", reviewed_by_person_key: "u2", reviewed_at: "2026-02-01T00:00:00.000Z" })
  })

  it("leaves the reviewer empty when they were not loaded", () => {
    expect(run([], [feedback({ reviewedBy: "ghost", reviewedAt: "2026-02-01T00:00:00.000Z" })]).feedback[0].reviewed_by_person_key).toBeNull()
  })

  it("skips a report from a person who was not loaded, and an unknown category or status", () => {
    const r = run([], [feedback({ id: "a", userId: "ghost" }), feedback({ id: "b", category: "RANT" }), feedback({ id: "c", status: "LOST" })])
    expect(r.feedback).toEqual([])
    expect(r.skipped.map((s) => s.key)).toEqual(["a", "b", "c"])
  })

  it("counts screenshot links it cannot carry", () => {
    const r = run([], [feedback({ screenshot: "https://example.test/x.png" })])
    expect(r.warnings).toEqual([{ key: "feedback", message: "1 screenshot links not migrated, xvm-api keeps screenshots as stored files" }])
  })

  it("cuts a long url and user agent", () => {
    const r = run([], [feedback({ url: "u".repeat(600), userAgent: "a".repeat(400) })])
    expect(r.feedback[0].url).toHaveLength(500)
    expect(r.feedback[0].user_agent).toHaveLength(300)
  })
})

describe("test and message reports", () => {
  const closed = (id: string, subject: string, over: Partial<ExportedFeedback> = {}) =>
    feedback({ id, subject, status: "COMPLETED", ...over })

  it("suggests dropping a closed report that looks like a test or a message, but still loads it", () => {
    const r = run([], [
      closed("a", "Test Feedback"),
      closed("b", "QA test: toast migration"),
      closed("c", "Hello ehno"),
      closed("d", "Ehno"),
      closed("e", "Improvement", { category: "IMPROVEMENT" }),
      closed("f", "Custom Role Colours"),
    ])
    expect(r.suggestedDrops.map((d) => d.key)).toEqual(["a", "b", "c", "d", "e"])
    expect(r.feedback).toHaveLength(6)
  })

  it("never suggests dropping an open report", () => {
    expect(run([], [feedback({ subject: "Test", status: "NEW" })]).suggestedDrops).toEqual([])
  })

  it("drops exactly the reports it is told to", () => {
    const r = run([], [closed("a", "Test"), closed("b", "Real request")], ctx({ excludeFeedback: new Set(["a"]) }))
    expect(r.feedback.map((f) => f.key)).toEqual(["b"])
    expect(r.skipped).toEqual([{ key: "a", reason: "excluded by decision" }])
  })
})
