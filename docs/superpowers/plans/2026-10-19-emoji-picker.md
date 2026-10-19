# Emoji Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare emoji text inputs on the platform reaction-role template editor and the venue reaction-role panel dialog with Frogge's picker — a visible, still-editable text box with a Pick button beside it — and render stored custom emoji as images instead of raw `<:name:id>` text.

**Architecture:** A port of three files already working in Frogge's dashboard (`FroggeBot/Dashboard`), adapted twice: to XVM's response envelope and design tokens, and to controlled React state where Frogge uses uncontrolled form fields. Lands in two slices. The first carries the shared foundation plus the platform surface, which needs Discord *application* emoji because a template has no guild. The second wires the venue surface, which uses the guild emoji route that already exists and has no consumer, and closes #217.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind v4, vitest. Two new dependencies (`unicode-emoji-json`, `@twemoji/api`). No xvm-api change.

---

Status: task 1 done, 2026-10-19. Tasks 2 to 6 outstanding.

## Why

**Both emoji fields are raw text boxes.** `app/admin/reaction-role-templates/page.tsx` and `components/reaction-role-panel-form-dialog.tsx` each ask for an emoji with `<Input placeholder="Emoji" />`. Getting a custom emoji in means typing `<:name:1234567890>` from memory or pasting it out of Discord.

**Stored custom emoji render as their markup.** That is #217: `<span>{opt.emoji ?? "•"}</span>` in two list sites shows the literal `<:frog:123>`.

**The venue emoji route already exists and nothing calls it.** `app/api/venues/[venueId]/discord/emojis/route.ts` is complete — cached, rate limited, returning `DiscordEmojiOption[]` — and the only caller in the repo is its own test.

**Frogge solved this, including the part specific to a platform-wide page.** Its `EmojiPicker` takes `emojiSource: "guild" | "application"`, and the prop comment names "the platform Reaction Role Templates page" as the reason application mode exists: a template is copied into every venue, and a guild's custom emoji cannot render outside the guild that owns it. An *application* emoji belongs to the bot's own Discord application, so it renders anywhere the bot is. Frogge's `bot/assets/emojis.py` carries the same reasoning for the bot side, having been bitten by hardcoded guild emoji ids.

## Scope

In:

- `unicode-emoji-json` as the Unicode source, and `lib/emoji.ts` for CDN and markup helpers.
- `components/emoji-picker.tsx` and `components/emoji-glyph.tsx`, ported from Frogge.
- `getApplicationEmojis` in `lib/discord-rest.ts`, and a route exposing it.
- Both emoji inputs, and the two #217 display sites.

Out:

- Any xvm-api change. The dashboard already calls Discord directly for guild emoji; application emoji uses the same bot token.
- The emoji shown on the venue-facing public panel. Only the dashboard's own rendering is in scope.
- Reordering, the 20-role cap, and the rest of #111's known limits.

## Decisions

**D1. The text input stays.** Frogge's picker renders a real `<input>` the user can type or paste into, with a Pick button beside it and a resolved preview image overlaid. Picker-only would lose paste, which is how a custom emoji actually gets entered today. Confirmed with Allegro 2026-10-19.

**D2. Application emoji on the platform page, guild emoji on the venue page.** Not Unicode-only on the platform page — application emoji are portable across guilds, which is the whole point of `emojiSource`.

**D3. A controlled `value`/`onChange` interface, not Frogge's `name`/`defaultValue`.** Frogge posts through server actions, so its picker is an uncontrolled form field keyed on `defaultValue` to survive revalidation. Both XVM call sites hold the emoji in React state (`optionDraft.emoji`, `draft.emoji`) and send it with `fetch`. Porting the uncontrolled shape would mean fighting it at both sites; a controlled component is the smaller change and drops the `key={defaultValue}` remount trick with it.

**D4. XVM's envelope, not Frogge's.** Frogge's guild route returns a bare `DiscordEmojiOption[]`; XVM's returns `{ guildId, emojis }`. The port reads `.emojis`, and the new application route matches XVM's shape rather than Frogge's.

**D5. The fetch stays lazy.** Frogge fetches on first open, not on mount. Both XVM surfaces render many option rows at once, so mount-time fetching would multiply the call by the number of rows.

**D6. XVM design tokens.** Frogge uses `bg-panel`, `bg-panel-2`, `text-text`, `text-muted`, `border-border`, `focus:border-accent`. XVM uses `var(--blue-015)`, `bg-background`, `text-muted-foreground` and friends. Restyle rather than importing Frogge's tokens.

**D7. A fetch failure degrades to Unicode.** Frogge sets an empty custom list and a `fetchFailed` flag, leaving ~1,900 Unicode emoji usable. Keep that: on the platform page a non-admin's 403 should not break the picker.

**D8. `DiscordEmojiOption` moves to `lib/emoji.ts`.** Added during task 1, replacing the original intent of importing it from `lib/discord-rest.ts`. That module holds the bot token, so a Client Component must not import from it at all — Frogge gates it with `import "server-only"` and duplicates the interface to cope. XVM dropped the gate when porting (`discord-rest.ts:4`), which makes a careless value import possible rather than impossible. Moving the type to the client-safe module and re-exporting it keeps one declaration and points nothing from client code at the token. `discord-rest.ts:9` already recorded the type as "inlined (they live in separate Frogge modules)", so this restores the original structure.

**D9. `twemojiCdnUrl` diverges from Frogge, which has a bug.** Added during task 1. Frogge runs its `toCodePoint` fallback for any string the twemoji callback does not resolve, and `toCodePoint` hex-dumps whatever it is handed: `"hello"` yields `68-65-6c-6c-6f.png`. Every caller then renders a broken image instead of falling back to text, which makes `EmojiGlyph`'s `if (!url)` branch unreachable and shows a broken image mid-typing in the picker. Gated on `twemoji.test(text)` — the distinction Frogge's own comment draws but its code does not apply. Verified `twemoji.test` is stable across repeated calls despite using a global regex. Pinned by a test.

## File structure

### New

```
apps/web/lib/emoji.ts                     twemojiCdnUrl, customEmojiCdnUrl,
                                          customEmojiMarkup, parseCustomEmojiMarkup
apps/web/lib/emoji.test.ts                markup parsing and CDN URL shaping
apps/web/components/emoji-picker.tsx      ported, controlled, XVM-styled
apps/web/components/emoji-glyph.tsx       ported as-is apart from tokens
apps/web/app/api/admin/discord/emojis/route.ts        application emoji, admin-gated
apps/web/app/api/admin/discord/emojis/route.test.ts
```

### Changed

```
apps/web/package.json                     + unicode-emoji-json ^0.9.0, @twemoji/api ^17.0.3
apps/web/lib/discord-rest.ts              DiscordEmojiOption out to lib/emoji (D8),
                                          + getApplicationEmojis
apps/web/app/admin/reaction-role-templates/page.tsx   both emoji inputs (add form, OptionRow)
apps/web/components/reaction-role-panel-form-dialog.tsx   the draft emoji input
apps/web/components/reaction-role-panels-board.tsx    :159 EmojiGlyph
docs/SHARED_ASSETS.md                     emoji-picker, emoji-glyph, emoji
```

`DiscordEmojiOption` is declared in `lib/emoji.ts` and re-exported from `lib/discord-rest.ts`, so its existing callers are untouched. See D8.

## PR slices

**Slice 1 — foundation and the platform surface.** Lands in #111, the branch that already builds that page. Tasks 1 to 4.

**Slice 2 — the venue surface and #217.** Its own PR off `dev` once slice 1 merges. Tasks 5 and 6.

### Task 1: The emoji library — done

- [x] Add `unicode-emoji-json@^0.9.0` and `@twemoji/api@^17.0.3`. The second was missed when planning; `twemojiCdnUrl` needs twemoji's own parser.
- [x] Port `lib/emoji.ts`, declaring `DiscordEmojiOption` and re-exporting it from `lib/discord-rest.ts` (D8).
- [x] Gate the `toCodePoint` fallback on `twemoji.test` (D9).
- [x] Unit tests: 11 across the four exports, including the FE0F emoji the fallback exists for and the non-emoji strings D9 is about.

Verified: 11/11, `tsc` clean, eslint clean, full suite 1214 passed / 3 skipped.

Open, not blocking: the CDN URL pins `twemoji@latest`, carried over from Frogge. A floating tag in an asset path can break on an upstream reshuffle; pinning a version is a separate call.

### Task 2: Application emoji

- [ ] `getApplicationEmojis` in `lib/discord-rest.ts`, next to `getGuildEmojis`, hitting `/applications/@me/emojis` with the same bot token and returning `DiscordFetchResult<DiscordEmojiOption[]>`.
- [ ] `app/api/admin/discord/emojis/route.ts`, gated with `requirePlatformAdmin` from `lib/admin-access.ts`, cached and rate limited like the venue route.
- [ ] Route tests: the guard refuses before Discord is called, a Discord failure is a 502, success returns the list.

Verify: `vitest run app/api/admin/discord/emojis`, `tsc`.

### Task 3: The picker

- [ ] Port `components/emoji-picker.tsx` with a controlled `value`/`onChange` (D3), XVM tokens (D6) and XVM's `{ emojis }` envelope (D4).
- [ ] Keep: lazy fetch on first open, search, Discord's category order with an empty query, flat results with a query, the overlaid preview image, and degrade-to-Unicode on a failed fetch.
- [ ] Port `components/emoji-glyph.tsx`.
- [ ] Add both to `docs/SHARED_ASSETS.md`.

Verify: `tsc`, `eslint`. No component test — `apps/web` has no jsdom; the logic worth testing is in `lib/emoji.ts` from task 1.

### Task 4: The template editor

- [ ] Replace the emoji `<Input>` in the add-role form and in `OptionRow` with `<EmojiPicker emojiSource="application" value={...} onChange={...} />`.
- [ ] `MAX_TEMPLATE_EMOJI` still bounds the value — the picker is an input, not a bypass.

Verify: `tsc`, `eslint`, full `vitest`, and a click-through: pick a Unicode emoji, pick a bot emoji, paste `<:name:id>`, clear the field, and confirm each saves and reloads correctly.

### Task 5: The venue dialog

- [ ] Replace the draft emoji `<Input>` in `reaction-role-panel-form-dialog.tsx` with the picker in guild mode, passing the `venueId` it already has.
- [ ] Confirm the existing venue route needs no change.

Verify: `tsc`, `eslint`, full `vitest`, click-through on a venue with custom emoji.

### Task 6: #217

- [ ] `EmojiGlyph` at `reaction-role-panels-board.tsx:159` and the matching site in the dialog.
- [ ] Close #217 referencing the PR.

Verify: a panel option with a custom emoji shows the image in both lists.

## Acceptance

- Both emoji fields offer a Pick button, and both still accept typed and pasted values.
- The platform page offers bot emoji and Unicode, with no guild in play.
- The venue dialog offers that venue's emoji and Unicode.
- A stored `<:name:id>` renders as an image everywhere the dashboard lists panel options.
- A failed emoji fetch leaves Unicode selectable rather than breaking the control.
- `tsc` clean, `eslint` 0 errors, full vitest green.
