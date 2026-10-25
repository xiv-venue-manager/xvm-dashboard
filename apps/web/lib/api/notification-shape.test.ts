import { describe, it, expect } from "vitest"
import { notificationLink, toBellNotification } from "./notification-shape"
import type { NotificationRow } from "@/lib/api/xvm-api"

const row = (over: Partial<NotificationRow> = {}): NotificationRow => ({
  id: 7,
  kind: "follower.new",
  title: "New follower",
  body: "Someone started following The Velvet Chord.",
  link: null,
  read_at: null,
  created_at: "2026-10-24T20:00:00Z",
  venue_id: "ven_1",
  venue_slug: "velvet-chord",
  target_type: null,
  target_id: null,
  ...over,
})

describe("notificationLink", () => {
  it.each([
    ["follower.new", "/dashboard/velvet-chord/analytics"],
    ["staff.joined", "/dashboard/velvet-chord/staff"],
    ["task.assigned", "/dashboard/velvet-chord/tasks"],
    ["task.completed", "/dashboard/velvet-chord/tasks"],
    ["shift.reminder", "/dashboard/velvet-chord/shifts"],
    ["shift.claim_submitted", "/dashboard/velvet-chord/shifts"],
    ["shift.claim_approved", "/dashboard/velvet-chord/shifts"],
    ["shift.claim_rejected", "/dashboard/velvet-chord/shifts"],
  ] as const)("sends %s to %s", (kind, expected) => {
    expect(notificationLink(row({ kind }))).toBe(expected)
  })

  it("has no link for a kind the dashboard has no page for", () => {
    expect(notificationLink(row({ kind: "venue.opened" }))).toBeNull()
    expect(notificationLink(row({ kind: "event.reminder" }))).toBeNull()
  })

  it("has no link when the notification is not about a venue", () => {
    expect(notificationLink(row({ venue_id: null, venue_slug: null }))).toBeNull()
  })

  it("keeps a link xvm-api sends when it is a path on this site", () => {
    expect(notificationLink(row({ link: "/dashboard/velvet-chord/staff" }))).toBe("/dashboard/velvet-chord/staff")
  })

  it.each([
    "https://evil.example/",
    "//evil.example/",
    "javascript:alert(1)",
    "/\\evil.example",
    "/\\/evil.example",
    "/\t/evil.example",
    "/\r\n/evil.example",
  ])(
    "ignores a link that leaves the site (%s) and builds its own",
    (link) => {
      expect(notificationLink(row({ link }))).toBe("/dashboard/velvet-chord/analytics")
    }
  )
})

describe("toBellNotification", () => {
  it("maps an unread row to the shape the bell reads", () => {
    expect(toBellNotification(row())).toEqual({
      id: "7",
      type: "follower.new",
      title: "New follower",
      body: "Someone started following The Velvet Chord.",
      link: "/dashboard/velvet-chord/analytics",
      read: false,
      createdAt: "2026-10-24T20:00:00Z",
    })
  })

  it("marks a row with a read time as read", () => {
    expect(toBellNotification(row({ read_at: "2026-10-24T21:00:00Z" })).read).toBe(true)
  })
})
