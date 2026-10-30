# Discord channel settings card

Closes #105. xvm-api keeps one row per venue of per-server switches the bot reads (`GET` and `PUT /venues/{id}/discord/settings`): `honeypot_channel_id`, `events_channel_id` and `rooms_channel_id`. The bot's own menus can set them. This puts the same three on the venue's settings page.

## Shape

1. `lib/api/xvm-api.ts`: `getDiscordSettings` and `updateDiscordSettings`. Snowflakes cross as strings, since a JS number rounds past 2^53.
2. `app/api/venues/[venueId]/discord/settings/route.ts`: GET for any member, PUT for Manager and up (`requireMyVenueRole`). The body is camelCase like the dashboard's other routes, each field a snowflake string or `null`, only the fields sent change. An empty body is a 400.
3. `components/discord-settings-card.tsx`: one `DiscordOptionPicker` per field over a single `useDiscordOptions(venue, "channels")`, with Save and Clear in the field's own row (a new optional `actions` slot on the picker, as the Frogge card keeps its Connect button beside its input). A list that can't load is explained once, above the rows, with a Try again. Each row says its own thing about its own channel (`channelProblem`): it can't be confirmed, it isn't in the server's list, or an id is wanted. Typing an id stays reachable when the bot isn't in the server.
4. `settings/page.tsx`: the old "Discord server" section and the new rows become one "Discord" panel. The Integrations card loses its "Discord OAuth sign-in" row, which is always true for someone who is signed in, and its "xvm-api Connected" row, which `dev` can no longer show anything else for: `GET /api/venues` only lists venues xvm-api knows. The connect handler, its state and the "Connect this venue to xvm-api first" hint go with it.

## Not doing

- Server-side check that the channel is in the venue's server. The bot only posts into a channel of the venue's own server, and the honeypot only watches that server's channels, so a foreign id does nothing.
- Folding in the Discord Shift Bot section. It saves with the page's own Save button, not per row, and nothing on `dev` reads it (see the PR).
- The log routes (`/discord/log-routes`). They are the notification settings #302 waits on, a separate card.

## Checks

Route tests (read, Manager gate, partial write, validation), client tests, `tsc`, lint, the suite, and a click-through against the local stack.
