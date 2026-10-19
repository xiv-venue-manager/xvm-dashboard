import { describe, it, expect } from "vitest"
import { toAnnouncementShape } from "./announcement-shape"

describe("toAnnouncementShape", () => {
  it("maps an xvm-api announcement to the shape the banner and admin page read", () => {
    expect(
      toAnnouncementShape({
        id: 5,
        title: "Maintenance",
        message: "Back at 11.",
        link: "https://example.com",
        link_label: "Status",
        starts_at: "2026-10-06T08:00:00Z",
        expires_at: "2026-10-07T08:00:00Z",
        created_by_person_id: 1,
        created_at: "2026-10-06T07:00:00Z",
      })
    ).toEqual({
      id: "5",
      title: "Maintenance",
      message: "Back at 11.",
      link: "https://example.com",
      linkLabel: "Status",
      expiresAt: "2026-10-07T08:00:00Z",
      createdAt: "2026-10-06T07:00:00Z",
    })
  })

  it("keeps the id a string and null link fields null", () => {
    const shape = toAnnouncementShape({ id: 9, link: null, link_label: null, expires_at: null } as never)
    expect(shape.id).toBe("9")
    expect([shape.link, shape.linkLabel, shape.expiresAt]).toEqual([null, null, null])
  })
})
