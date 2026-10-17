// Mirrors api/constants.py - no shared source to import from, so keep them in step. The names
// differ on both sides, so each one records the constant it mirrors: without that the only way to
// check the mirror is to map all seven by hand. Verified in step 2026-10-12.
// Kept clear of zod so the editor page can read the cap without pulling the
// validation schemas (and zod) into the client bundle.
export const MAX_TEMPLATE_OPTIONS = 20 // MAX_REACTION_ROLE_OPTIONS
export const MAX_TEMPLATE_NAME = 100 // MAX_REACTION_ROLE_TEMPLATE_NAME_LENGTH
export const MAX_TEMPLATE_TITLE = 100 // MAX_REACTION_ROLE_TITLE_LENGTH -> MAX_TITLE_LENGTH
export const MAX_TEMPLATE_DESCRIPTION = 2000 // MAX_REACTION_ROLE_TEMPLATE_DESCRIPTION_LENGTH
export const MAX_TEMPLATE_ROLE_NAME = 100 // MAX_REACTION_ROLE_ROLE_NAME_LENGTH
export const MAX_TEMPLATE_EMOJI = 100 // MAX_REACTION_ROLE_EMOJI_LENGTH
export const MAX_DISCORD_COLOR = 0xffffff // MAX_DISCORD_COLOR
