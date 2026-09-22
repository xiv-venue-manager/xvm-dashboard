# Reaction-role panels dashboard design

Manager-facing web dashboard integration for xvm-api's reaction-role panels feature. The bot side is already live (xvm-bot PRs #13/#14/#15, merged 2026-09-21) — venues currently have no way to manage panels except through the bot's own Discord UI. No dashboard UI exists at all yet (no `reaction` directory under `apps/web/app`).

## Context

Key API facts this design relies on (`xvm-api-local/src/api/routers/reactionroles.py`, `schemas/reactionroles.py`):

- `PanelRow`: `id, title, description, thumbnail_url, color, message_type, options[], created_at, updated_at`. `OptionRow`: `id, role_id (Snowflake), label, emoji, sort_order` — a button needs a label or an emoji, not necessarily both.
- Panel CRUD (`list`, `create`, `get`, `update`, `delete`, thumbnail upload) is synchronous, Manager tier for writes, readable by any member.
- `POST /from-template` (202) and `POST /{panel_id}/posts` (202) are **async** — the bot does the work and there is no response body. The dashboard finds out by re-fetching (`list_panels`, `list_panel_posts`).
- Templates (`TemplateRow`: `name, title, description, message_type, options[]`) are a platform-wide catalog, admin-owned (`platform_admin` scope via `/admin/reaction-role-templates`). Venue managers only read them, to pick one for "Apply Template."
- `role_id` and `channel_id` are raw Discord snowflakes (`Field(ge=0)`) — same `Number.MAX_SAFE_INTEGER` caveat this codebase already documents for `discord_user_id` elsewhere; never round-trip through `number`, always `string`.
- Panel cap and option cap exist (409 on exceeding either) — surfaced, not designed around.

## Out of scope

- **Channel/role picker with display names (item #3 of the wider alignment survey).** Not built, owner undecided. This design uses raw snowflake-ID text inputs instead. The API already takes raw IDs, so swapping in a real picker later is a pure UI change with no API contract change.
- **Admin template CRUD.** Templates are created/edited only by platform admins via `/admin/reaction-role-templates`, a separate surface (`apps/web/app/admin`) from this venue-facing pass. This design only reads templates (`GET /reaction-role-templates`).
- Any xvm-api schema or contract changes.

## Architecture & file layout

Follows the `Rooms`/`Contests` convention: server page (session + venue guard, fetches initial data) → client board component → Next.js API proxy route (holds `personToken`, session-gated, mirrors `rooms/page.tsx` and `contests/page.tsx`, not the older client-fetch-everything pattern used by `tasks/page.tsx`) → `lib/api/xvm-api.ts` client → xvm-api backend.

```
app/dashboard/[slug]/reaction-roles/
  page.tsx                          — server component: session+venue guard, fetches
                                       list_panels + list_templates (read-only), renders board

components/
  reaction-role-panels-board.tsx    — client board: card grid, create/apply-template triggers
  reaction-role-panel-form-dialog.tsx — create/edit panel + manage options (role_id text input)
  apply-template-dialog.tsx         — pick template (from the read-only list) + channel_id text input

app/api/venues/[venueId]/reaction-role-panels/
  route.ts                          — GET (list), POST (create empty panel)
  [panelId]/route.ts                — GET, PATCH, DELETE
  [panelId]/options/route.ts        — POST (add option)
  [panelId]/options/[optionId]/route.ts — PATCH, DELETE
  [panelId]/posts/route.ts          — GET (list posts), POST (ask bot to post)
  [panelId]/thumbnail/route.ts      — PUT (multipart upload)
  from-template/route.ts            — POST (ask bot to apply a template)
  templates/route.ts                — GET (read-only list, for the Apply-Template picker)

lib/api/xvm-api.ts   — add: listPanels, createPanel, updatePanel, deletePanel, addOption,
                        updateOption, deleteOption, setPanelThumbnail, applyTemplate,
                        postPanel, listPanelPosts, listReactionRoleTemplates (read-only)
```

Sidebar: one new entry, `Reaction Roles`, in the `Manage` group of `components/venue-sidebar.tsx` (alongside `Overview`/`Analytics`/`Live Mode` — this is a venue configuration/engagement screen, not a day-to-day Operations item like Tasks/Shifts). `roles: ["OWNER", "MANAGER"]` gate matches Analytics' existing pattern, since read access technically extends to any member but the whole screen's purpose is management.

## Pages & components

### `ReactionRolePanelsBoard` (list)

Card grid, one card per panel (matches `ContestsBoard`'s card-grid choice over a table, for the same reason — a handful of panels at once, more visual room):

- Title, description, thumbnail (if set), color swatch, message type, list of options (label/emoji → role ID, truncated with a copy button)
- "Posted to" section per card: channels the panel currently lives in (`list_panel_posts`), each with a small unposted/posted indicator
- "Post to channel" button (Manager+) opens a small inline form: `channel_id` text input, confirm — async flow, see below
- "Edit"/"Delete" (Manager+) — delete confirms via `AlertDialog` (mirrors `ContestsBoard`'s roll-confirm pattern), warns that every posted copy comes down first (matches the API's own delete semantics)
- "+ New Panel" (Manager+) opens `ReactionRolePanelFormDialog` in create mode
- "Apply Template" (Manager+) opens `ApplyTemplateDialog`
- Empty/disconnected state matches Rooms'/Contests' `notConnected` pattern (`!venue.xvmApiVenueId`)

### `ReactionRolePanelFormDialog` (create/edit)

Modal dialog (matches `ContestFormDialog` convention): `title`, `description`, `color` (native `<input type="color">` — no color-picker component exists anywhere in this codebase today, including Contests, whose `color` field is API-only with no form control; not worth introducing a new dependency for one field), `message_type`. Options managed as a repeatable row list within the same dialog: `role_id` (text input, digit-string validated), `label`, `emoji` — at least one of label/emoji required per row, matching `OptionCreate`'s own validator. Thumbnail upload is a separate action on the card (existing panels only — `PUT /{panel_id}/thumbnail` needs a panel to attach to), not part of the create form.

### `ApplyTemplateDialog`

- `Select` of templates from `GET /reaction-role-templates` (read-only, name + option count + role names shown for preview)
- `channel_id` text input (digit-string validated)
- Submit → `POST /from-template` (202) → async flow, see below

## Async UX (from-template / post-to-channel)

Both `POST /from-template` and `POST /{panel_id}/posts` return `202` with no body — the bot does the work.

1. On submit: `toast.loading("Asking the bot...")`, disable the submit button.
2. Poll the relevant read endpoint every 2s, up to 15s:
   - Post-to-channel: `GET /{panel_id}/posts`, looking for the new `channel_id`.
   - Apply-template: `GET` the panel list, looking for a panel that wasn't there before (template application can't be correlated to a single new panel by ID up front, so this diffs the list rather than polling a specific resource).
3. Found within 15s → `toast.success`, refresh the board's local state, close the dialog.
4. Not found within 15s → `toast.info("Still working — refresh in a moment")`, close the dialog anyway. This is a timeout, not a failure state — the bot may just be slow (Discord API rate limits), not broken, so no error styling.

## Permissions & error handling

- Mirrors the API's own tiering: view (list panels, list posts) = any venue member; create/edit/delete/post/apply-template = Manager+, gated by hiding the UI affordance (as Rooms/Contests do) with the API's 403 as the real backstop.
- `notConnected` and `isXvmAuthFailure` handling copy the Rooms/Contests page pattern exactly, including the `invalidateXvmApiCredential` call on auth failure.
- 409 (panel cap, option cap, duplicate role/name) and 404 (panel or template gone) get their own toast copy since they're expected states, not bugs — matches the `tasks`/`contests` proxy-route convention (`xvmApiErrorResponse`).
- Malformed snowflake input (non-digit string in a `channel_id`/`role_id` field) is caught client-side before the request fires — a plain regex check (`/^\d+$/`), not a full picker, since that's explicitly out of scope here.

## Testing

- `lib/api/xvm-api.test.ts` gets new cases for the reaction-role client functions (request shape, error mapping), following the existing `Giveaways API`/`transactions.test.ts` pattern.
- No proxy-route tests and no component tests — verified none of `Rooms`/`Contests`/`Tasks`' proxy routes or components have test coverage today either (checked: no `.test.ts` anywhere under `app/api`, no `.test.tsx` next to any board component), so this stays consistent with existing coverage rather than introducing a new standard unilaterally.
