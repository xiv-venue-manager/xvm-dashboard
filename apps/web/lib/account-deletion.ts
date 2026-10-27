export type DeletionOutcome =
  | { kind: "scheduled"; anonymisesOn: string }
  | { kind: "refused"; message: string }
  | { kind: "failed"; message: string }

export const DELETION_FAILED = "Could not delete your account. Try again in a moment."

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
}

export function deletionOutcome(status: number, body: unknown): DeletionOutcome {
  const fields = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {}
  if (status === 200 && typeof fields.anonymisesAt === "string") {
    return { kind: "scheduled", anonymisesOn: formatDay(fields.anonymisesAt) }
  }
  const message = typeof fields.error === "string" && fields.error ? fields.error : DELETION_FAILED
  return status === 409 ? { kind: "refused", message } : { kind: "failed", message }
}
