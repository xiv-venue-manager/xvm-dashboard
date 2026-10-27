export const DELETION_REASON = "deletion"
export const DELETION_SIGN_IN_URL = `/auth/signin?reason=${DELETION_REASON}`

const DELETION_NOTICE =
  "Your session ended because this account is scheduled for deletion or was deleted. Signing in again cancels a pending deletion."

export function signInNotice(reason: string | null): string | null {
  return reason === DELETION_REASON ? DELETION_NOTICE : null
}
