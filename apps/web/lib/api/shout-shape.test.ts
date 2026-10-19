import { describe, it, expect } from "vitest"
import { toShoutShape } from "./shout-shape"

describe("toShoutShape", () => {
  it("maps an xvm-api shout to the shape the Shout Crafter app reads", () => {
    expect(
      toShoutShape({
        id: 12,
        label: "Friday open",
        fields: { venue: "Lilypad" },
        template_id: "open-now",
        separator_id: "dot",
        decor_id: "diamond",
        created_at: "2026-10-06T12:00:00Z",
      })
    ).toEqual({
      id: "12",
      label: "Friday open",
      fields: { venue: "Lilypad" },
      templateId: "open-now",
      separatorId: "dot",
      decorId: "diamond",
      createdAt: "2026-10-06T12:00:00Z",
    })
  })

  it("keeps the id a string, which is what the app declares", () => {
    expect(typeof toShoutShape({ id: 3 } as never).id).toBe("string")
  })
})
