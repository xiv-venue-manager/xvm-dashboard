# Meet the team page

Date: 2026-10-29. Revised the same day: roles and groups became curated lists (see "Roles and groups").

## Goal

A public `/team` page introducing the people who build and run XVM. Each card has a photo, name, one or more roles and a short bio, and sits under a group heading. Team members write their own bio and photo. Admins decide who is on the team, which roles and group each person has, and maintain the lists of roles and groups.

Per-venue staff pages are out of scope. They may follow if there is demand, and the data shape below does not rule them out.

## Decisions

- Scope: the XVM team only (builders, testers, and so on).
- Visibility: public, no sign-in needed to read.
- Authoring: self-edit by members. No moderation step; only people an admin has added can write.
- Storage: new tables in xvm-api. The dashboard reads through xvm-api only, no Prisma.
- Photos: uploaded through xvm-api, stored in MinIO via the existing `MediaStorage`.
- Delivery: one author builds both halves. The xvm-api PR goes to Allegro for review and merge.
- Roles and groups are curated lists that admins add to and remove from, not free text. A person has one or more roles and exactly one group.

## Roles and groups

- `team_roles` and `team_groups` are lists with a name (unique ignoring case) and a position. Roles are up to 80 characters, groups up to 40.
- A person has one or more roles (at least one) and exactly one group. The group is required: it is how the page separates people.
- Removing a role or group that anyone uses is refused with "Used by N people". It is never removed from people silently, so nobody can be left without a group or role.
- Renaming a role or group renames it everywhere.
- Sections on the public page follow the groups list order, which admins set. A group nobody is in does not show. Within a group people follow their own order number. A person's role chips follow the roles list order.
- The `team_members` migration was not yet pushed when this changed, so it is rewritten in place and no data is migrated.

## xvm-api

### Tables

`team_groups`: `id`, `name` (string(40), unique ignoring case), `sort_order`.

`team_roles`: `id`, `name` (string(80), unique ignoring case), `sort_order`.

`team_members`:

| Column | Type | Notes |
|---|---|---|
| `person_id` | FK `people.id`, unique | `ON DELETE CASCADE` |
| `group_id` | FK `team_groups.id`, required | `ON DELETE RESTRICT`, admin-controlled |
| `bio` | text, nullable | max 1000 chars, enforced in the schema |
| `photo_key` | string, nullable | MinIO key; URL computed by `url_for()` |
| `photo_x`, `photo_y` | float, default 0.5 | where the photo is positioned in its square, 0 to 1, member-controlled |
| `photo_zoom` | float, default 1.0 | zoom, 1 to 3, member-controlled |
| `sort_order` | int | admin-controlled, order within the group |
| `listed` | bool, default true | member-controlled |

`team_member_roles`: `member_id` (FK `team_members.id`, `ON DELETE CASCADE`) and `role_id` (FK `team_roles.id`, `ON DELETE RESTRICT`), primary key on the pair.

The card name is `PersonModel.display_name`. There is no separate team name.

### Endpoints

| Route | Access | Behaviour |
|---|---|---|
| `GET /public/team` | public | Listed members ordered by group position, then `sort_order`, then id: name, `roles` (names in roles list order), `group` (name), bio, photo URL and the photo position and zoom. |
| `GET /me/team-profile` | signed-in person | Their card with role and group names, or 404 if not on the team. |
| `PATCH /me/team-profile` | team member | Edits `bio`, `listed`, `photo_x`, `photo_y` and `photo_zoom` only. The photo values cannot be null and are bounded (0 to 1, and 1 to 3). |
| `PUT /me/team-profile/photo` | team member | Multipart upload, existing image checks, stored under `team/<person_id>/`. The old photo is deleted and the position and zoom go back to centre at 1x. |
| `GET /admin/team/roles`, `GET /admin/team/groups` | platform admin | The list in order, each item with its id, name, position and `member_count`. |
| `POST /admin/team/roles`, `POST /admin/team/groups` | platform admin | Adds an item at the end. A duplicate name (ignoring case) is a 409. |
| `PATCH /admin/team/roles/{id}`, `PATCH /admin/team/groups/{id}` | platform admin | Renames. |
| `DELETE /admin/team/roles/{id}`, `DELETE /admin/team/groups/{id}` | platform admin | Removes an unused item. A 409 "Used by N people" if anyone has it. |
| `PUT /admin/team/roles/order`, `PUT /admin/team/groups/order` | platform admin | Takes the full list of ids in the new order and applies it in one change. |
| `GET /admin/team` | platform admin | All members, including unlisted, with role and group as both ids and names, and the photo position and zoom (so the admin list can show each photo the way the card does). |
| `GET /admin/team/candidates?q=` | platform admin | People matching a name fragment (two or more characters) who are not on the team yet. |
| `POST /admin/team` | platform admin | Adds a person with `role_ids` (at least one), a required `group_id` and an optional `sort_order`. |
| `PATCH /admin/team/{person_id}` | platform admin | Edits `role_ids`, `group_id` and `sort_order`. |
| `DELETE /admin/team/{person_id}` | platform admin | Removes the card and the photo. The person record is untouched. |

Members cannot edit roles, group or order. Admin gating uses the existing `is_platform_admin` check (`_admin_or_403`). A role or group id that does not exist is a 404; a `role_ids` list that is empty or repeats an id is a 422.

## Dashboard

### `/team` (public)

- Server-rendered rows, reading `GET /public/team` through the xvm-api client. One person per row: a 120px square photo on the left, beside name, role chips and the full bio. Each card is as wide as its content, up to the 860px column, with a minimum width of 22rem so a card with no bio does not shrink to a small box. Cards share one left edge. The photo does not alternate sides: alternating looked uneven once cards had different widths. At 375px each card is full width with the photo above the text.
- A person's roles show as a row of chips in roles list order, wrapping when there are many.
- Rows are split into sections under uppercase blue group headings (for example "Builders", "Testers"), in the order the API returns them, which is the groups list order.
- If the team outgrows a short list, revisit the row layout (a compact two-column roster was the alternative considered).
- In `sitemap.ts`, with page metadata, linked from the footer. The proxy allows signed-out visitors on `/team` only; `/team/edit` and the API routes stay behind sign-in.
- Empty team shows a short placeholder. A member with no photo gets an initials placeholder.
- Spacing matches `/privacy` and `/terms` (64px above the title).
- For signed-in visitors, `GET /me/team-profile` decides whether an "Edit my card" button shows. Saves refresh the page immediately (the data is tagged and revalidated), not after the 60 second cache window.

### `/team/edit` (members)

- Photo upload, bio textarea with a 1000-character counter, "show me on the page" toggle, live card preview.
- Roles and group are shown read-only with a note that an admin sets them.

### `/admin/team` (platform admins)

Uses the shared admin page style (`page-inner`, centred, `page-h1` title with an icon) like `/admin/announcements`. Three sections:

1. **Roles and Groups**, side by side on desktop and stacked on a phone. Each is a list with up and down arrows to reorder, rename in place, a bin button that is disabled while the item is in use (with "Used by N people" beside it), and an add box. A group cannot be removed while anyone is in it, so the group list is never left in a state where a person has none.
2. **Add someone**: the name search, then a roles multi-select (at least one) and a group dropdown (required), then Add. With no groups yet, the section says to add a group first.
3. **The team list**: each row has the name, a roles multi-select, a group dropdown, an order number and Save. Save shows a brief "Saved" tick. Removal asks for confirmation.

Controls: the group dropdown is the shared `select`. The roles control is a new shared `MultiSelect`, built on the shared `dropdown-menu` checkbox items so it looks the same, staying open while several are ticked. It is recorded in `docs/SHARED_ASSETS.md`. The toggling logic is a small tested helper.

One set of dashboard routes serves both lists, `/api/admin/team-catalogue/{roles|groups}`, with id and order variants, rather than near-identical route files per list.

The admin search says so when nobody matches, and asks for "at least two letters of their name" when the query is too short.

## Photo position

The photo is stored whole and shown in a 120px square. The member chooses which part shows, so a portrait is not just centre-cropped.

- Stored per card: `photo_x`, `photo_y` (0 to 1, default 0.5) and `photo_zoom` (1 to 3, default 1). The original image is never cut, so it can be re-adjusted at any time.
- Rendering is CSS only. Inside a square frame with `overflow: hidden`, the image sits in a box `zoom` times the frame, `object-fit: cover`, with `object-position` at `x%` `y%`, and the box is offset by `-(zoom - 1) * x` and `-(zoom - 1) * y` of the frame so the chosen point lines up with the same point of the frame. At zoom 1 it is plain `object-position`. The same component draws the public card and the edit preview, so they always match.
- Editing is on `/team/edit` once a photo exists: a square frame the same shape as the card, drag to move the photo, a slider for zoom (1x to 3x), and a Reset button. Dragging by `d` pixels along an axis changes that coordinate by `-d / overflow`, where `overflow` is `zoom * displayed size - frame size` for that axis, clamped to 0 to 1. The values save with the bio and the listing toggle.
- Only the member can change their own photo position; admins cannot, as with the bio.

## Testing

- API: pytest, including that a member cannot change their roles, group or order, that `GET /public/team` hides unlisted members and orders by group position, that a used role or group cannot be removed, that duplicate names are refused ignoring case, and that non-admins get 403 on every admin route.
- Dashboard: vitest for the helpers and the route handlers, `tsc --noEmit`, `pnpm run lint`, and a live click-through against local dev.

## Settled in the plans

- Photo rendering: a plain `<img>`, as the venue page does. The CSP `img-src` is checked in the live click-through; locally the API's media origin has to be allowed.
- Person search for the admin "add member" screen: xvm-api had no lookup, so `GET /admin/team/candidates` was added.
