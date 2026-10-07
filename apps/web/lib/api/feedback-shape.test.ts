import { describe, it, expect } from "vitest"
import { toAdminFeedbackShape, toFeedbackShape, toXvmFeedbackValue } from "./feedback-shape"
import type { AdminFeedbackRow } from "./xvm-api"

const row = (over: Partial<AdminFeedbackRow> = {}): AdminFeedbackRow => ({
  id: 12,
  person_id: 3,
  category: "bug_report",
  status: "under_review",
  subject: "Broken button",
  description: "It does nothing when clicked.",
  url: "https://example.test/page",
  user_agent: "TestAgent/1.0",
  screenshot_url: null,
  admin_notes: "Looking",
  reviewed_by_person_id: 9,
  reviewed_at: "2026-10-07T10:00:00Z",
  created_at: "2026-10-07T09:00:00Z",
  updated_at: "2026-10-07T10:00:00Z",
  person_display_name: "Test Person",
  reviewed_by_display_name: "Test Admin",
  ...over,
})

describe("toXvmFeedbackValue", () => {
  it("lowercases the dashboard's enum values for xvm-api", () => {
    expect(toXvmFeedbackValue("BUG_REPORT")).toBe("bug_report")
    expect(toXvmFeedbackValue("WONT_FIX")).toBe("wont_fix")
  })
})

describe("toFeedbackShape", () => {
  it("maps a row to the shape the dashboard reads, with a string id and upper-case enums", () => {
    expect(toFeedbackShape(row())).toEqual({
      id: "12",
      category: "BUG_REPORT",
      status: "UNDER_REVIEW",
      subject: "Broken button",
      description: "It does nothing when clicked.",
      url: "https://example.test/page",
      userAgent: "TestAgent/1.0",
      adminNotes: "Looking",
      reviewedAt: "2026-10-07T10:00:00Z",
      createdAt: "2026-10-07T09:00:00Z",
      updatedAt: "2026-10-07T10:00:00Z",
    })
  })
})

describe("toAdminFeedbackShape", () => {
  it("names the submitter and the reviewer", () => {
    const shape = toAdminFeedbackShape(row())
    expect(shape.user).toEqual({ id: "3", displayName: "Test Person" })
    expect(shape.reviewer).toEqual({ id: "9", displayName: "Test Admin" })
  })

  it("has no reviewer before the report is triaged", () => {
    const shape = toAdminFeedbackShape(row({ reviewed_by_person_id: null, reviewed_by_display_name: null }))
    expect(shape.reviewer).toBeNull()
  })

  it("falls back to the person id when xvm-api cannot name someone", () => {
    const shape = toAdminFeedbackShape(row({ person_display_name: null, reviewed_by_display_name: null }))
    expect(shape.user.displayName).toBe("Person #3")
    expect(shape.reviewer?.displayName).toBe("Person #9")
  })
})
