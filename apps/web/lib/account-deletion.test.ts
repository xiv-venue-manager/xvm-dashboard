import { describe, it, expect } from "vitest"

import { DELETION_FAILED, deletionOutcome } from "./account-deletion"

describe("deletionOutcome", () => {
  it("is scheduled on a 200, with the day the account is anonymised", () => {
    expect(deletionOutcome(200, { anonymisesAt: "2026-11-26T09:00:00Z" })).toEqual({
      kind: "scheduled",
      anonymisesOn: "26 November 2026",
    })
  })

  it("keeps the refusal text of a 409, so the person can fix what blocks it", () => {
    expect(deletionOutcome(409, { error: "Unpaid payroll at Velvet Rift." })).toEqual({
      kind: "refused",
      message: "Unpaid payroll at Velvet Rift.",
    })
  })

  it("is a failure, with the route's message, on a 503", () => {
    expect(deletionOutcome(503, { error: "xvm-api request failed" })).toEqual({
      kind: "failed",
      message: "xvm-api request failed",
    })
  })

  it("falls back to a generic failure when the body has no message or is not JSON", () => {
    expect(deletionOutcome(500, null)).toEqual({ kind: "failed", message: DELETION_FAILED })
    expect(deletionOutcome(409, {})).toEqual({ kind: "refused", message: DELETION_FAILED })
  })

  it("does not call a 200 without a date scheduled", () => {
    expect(deletionOutcome(200, {})).toEqual({ kind: "failed", message: DELETION_FAILED })
  })
})
