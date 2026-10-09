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
