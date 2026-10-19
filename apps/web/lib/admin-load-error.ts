export function adminLoadErrorMessage(status: number): string {
  if (status === 403) {
    return "You need platform admin access to view this page. If you have just been given access, sign out and back in to pick it up."
  }
  if (status === 503) return "Your connection to xvm-api needs refreshing. Sign out and back in."
  return `Couldn't load this page (error ${status}).`
}
