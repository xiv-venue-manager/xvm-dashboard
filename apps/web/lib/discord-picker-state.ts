export interface DiscordOption {
  value: string
  label: string
  /** Discord's integer colour, for a role swatch. 0 means "no colour". */
  color?: number
  /** Why this option is unsafe to pick, if it is. Rendered, never hidden. */
  note?: string | null
}

/** Why the list is not available, and whether trying again could help. */
export interface PickerProblem {
  message: string
  retryable: boolean
}

/**
 * Why a picker has no list, in words a person can act on.
 *
 * The failure modes are kept apart rather than collapsed into an empty list.
 * `discord-rest.ts:110` records what collapsing them cost: every picker on the site sat in its
 * "paste an id" fallback while the logs showed nothing but 200s, so a broken integration looked
 * like a deliberate design choice for as long as nobody thought to check.
 *
 * Only a transient failure is retryable. Telling someone to try again when the bot is not in
 * their server sends them round a loop that cannot end.
 */
export function pickerProblem(status: number, body: { error?: string; message?: string }): PickerProblem {
  if (body.error === "not_linked") {
    return { message: "No Discord server is connected to this venue yet.", retryable: false }
  }
  if (body.error === "bot_absent") {
    return { message: "The bot isn't in this venue's Discord server.", retryable: false }
  }
  if (body.error === "not_connected") {
    return { message: "This venue isn't connected to xvm-api yet.", retryable: false }
  }
  if (status === 403) {
    return { message: "You don't have access to this venue's Discord server.", retryable: false }
  }
  return { message: body.message ?? body.error ?? "Couldn't reach Discord.", retryable: true }
}

/**
 * The roles a picker offers: the safe ones, plus whatever this row already holds.
 *
 * A row saved against @everyone, a managed role or an Administrator role has to keep showing it.
 * Drop it from the options and an uncontrolled select falls back to its first entry, so saving an
 * unrelated field on the same form silently rewrites the role. `discord-rest.ts:183` is the same
 * reasoning behind `filterAssignableRoles`'s `alwaysInclude`.
 */
export function offeredRoles(options: DiscordOption[], value: string): DiscordOption[] {
  return options.filter((option) => !option.note || option.value === value)
}

/**
 * Whether "Pick from list" can do anything.
 *
 * It cannot while the current value is absent from the list: `showsManualEntry` would send the
 * person straight back, because a dropdown cannot show a value it does not contain without
 * appearing to clear the field. Offering a button that does nothing is worse than not offering
 * it, so the way back appears once the field is empty or holds something listed.
 */
export function canReturnToList(options: DiscordOption[], value: string): boolean {
  if (options.length === 0) return false
  return value === "" || options.some((option) => option.value === value)
}

/**
 * Whether "Search instead" can do anything without taking something with it.
 *
 * Only while the field is empty. A non-empty value in the id field is either something somebody
 * typed a moment ago or something loaded from a saved record, and the component cannot tell those
 * apart: `picked` is only ever set by choosing from a result list, never from the `value` prop.
 * Clearing is reasonable for the first and silent data loss for the second, so the way back
 * appears once there is nothing to lose, and emptying the field is what reveals it.
 *
 * Same resolution as `canReturnToList`, deliberately: the two pickers should not disagree about
 * what their way-back button does to a value nobody typed.
 */
export function canReturnToSearch(value: string, problem: PickerProblem | null): boolean {
  if (problem !== null && !problem.retryable) return false
  return value === ""
}

/**
 * Two characters for an avatar fallback.
 *
 * Discord names lean on decoration, so initials come from letters and digits only. A name with
 * neither still has to render something the same size as every other row.
 */
export function initials(name: string): string {
  return (
    name
      .replace(/[^\p{L}\p{N}]/gu, "")
      .slice(0, 2)
      .toUpperCase() || "#"
  )
}

/**
 * Whether to show the type-an-id field instead of the dropdown.
 *
 * Five reasons, and only the first is a preference: the person asked for it; the field is disabled
 * and nothing has loaded, so a dropdown would be dead and silent about why; the list could not be
 * loaded; the list loaded and is empty; or the saved value is not in the list, which a dropdown
 * cannot represent without appearing to clear the field.
 *
 * The disabled case matters because it is what a half-filled form looks like. The reaction-role
 * dialog disables this field until the panel itself is saved, and a greyed-out dropdown that will
 * not open reads as a broken integration, where the plain field it replaced read as "not yet".
 * Once a list has loaded the dropdown stays, so a momentary disable mid-submit does not make the
 * control change shape under the person using it.
 */
export function showsManualEntry({
  requested,
  disabled = false,
  problem,
  loading,
  options,
  value,
}: {
  requested: boolean
  disabled?: boolean
  problem: PickerProblem | null
  loading: boolean
  options: DiscordOption[]
  value: string
}): boolean {
  if (requested || problem !== null) return true
  if (disabled && options.length === 0) return true
  if (loading) return false
  if (options.length === 0) return true
  return value !== "" && !options.some((option) => option.value === value)
}

/** Discord's member search is prefix-based, and a one-letter query returns a page of strangers. */
export const MIN_MEMBER_QUERY = 2

export function memberQueryReady(query: string): boolean {
  return query.trim().length >= MIN_MEMBER_QUERY
}

/**
 * Why a member search failed. Search runs per keystroke, so the rate limit is an ordinary way
 * to fail rather than an error: it is retryable and the next keystroke is the retry.
 */
export function memberSearchProblem(status: number, body: { error?: string; message?: string }): PickerProblem {
  if (status === 429) return { message: "Searching too fast. Try again in a moment.", retryable: true }
  return pickerProblem(status, body)
}
