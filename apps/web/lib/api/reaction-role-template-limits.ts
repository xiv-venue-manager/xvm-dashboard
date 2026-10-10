// Mirrors api/constants.py - no shared source to import from, so keep them in step.
// Kept clear of zod so the editor page can read the cap without pulling the
// validation schemas (and zod) into the client bundle.
export const MAX_TEMPLATE_OPTIONS = 20
export const MAX_TEMPLATE_NAME = 100
export const MAX_TEMPLATE_TITLE = 100
export const MAX_TEMPLATE_DESCRIPTION = 2000
export const MAX_TEMPLATE_ROLE_NAME = 100
export const MAX_TEMPLATE_EMOJI = 100
export const MAX_DISCORD_COLOR = 0xffffff
