# Auto-approve shift claims design

Venue settings gets a switch that lets a venue skip manager approval for shift claims. It is off by default, so venues that require approval keep that behaviour. Turning it on also approves claims already waiting, so the venue starts from a clean slate.

## Context

xvm-api already models this setting. `VenueShiftSettingsModel.approval_required` (`src/api/models/shifts.py`) defaults to `true`, and `PATCH /venues/{venue_id}/shifts/settings` (`src/api/routers/shifts.py`) is Manager tier. New event-shift joins set `approved_at` immediately when the setting is `false` (`src/api/services/roster.py`). The dashboard does not expose the setting.

The only new backend behaviour is bulk approval when the switch is turned on. Today a manager approves seats one at a time through `POST /venues/{venue_id}/shifts/{shift_id}/approve`.

## Desired behaviour

- The setting appears in the dashboard's venue settings, under **Operations**, as **Auto-approve shift claims**.
- The switch starts off. Off means `approval_required: true`, which is today's default.
- Turning it on sets `approval_required: false` and approves every eligible pending claim at the venue in the same transaction.
- Future claims take their seat immediately while the switch is on.
- Turning it off sets `approval_required: true`. Claims already approved stay approved; future claims wait for a manager.
- Bulk approval skips claims that are cancelled, already started, or past their scheduled end plus `MISSED_GRACE`. It never changes an already-approved claim.
- Bulk approvals stamp the acting manager as `approved_by_person_id`, write an `approve` audit entry with source `dashboard`, and refresh any affected event posts.
- Only owners and managers can change the setting. The existing xvm-api tier check remains the authority; the dashboard hides the control from staff.

## API

Reuse `PATCH /venues/{venue_id}/shifts/settings` and add an `approve_pending` query flag:

```
PATCH /venues/{venue_id}/shifts/settings?approve_pending=true
{"approval_required": false}
```

- `approve_pending` defaults to `false`, so existing callers are unchanged.
- The route applies the settings update, then approves eligible pending shifts when `approve_pending=true`.
- The response stays `ShiftSettings`; no response shape change.
- The settings write and the approvals commit together. A failure rolls back both.
- An `approve_pending=true` call is idempotent: with no pending claims it just updates the setting, and with `approval_required` already `false` it still clears any backlog.

Add `ShiftService.approve_pending(...)` to own the query and per-row approval. Reuse the existing approval path so audit entries, `approved_by_person_id`, and event-post refreshes stay consistent. Query eligible rows in the venue, lock them, and skip rows that no longer qualify under the same rules as `approve()`.

## Dashboard API

Add `GET` and `PATCH` at `apps/web/app/api/venues/[venueId]/shift-settings/route.ts`.

- `GET` returns `{ autoApprove: !approval_required }`.
- `PATCH` accepts `{ enabled: boolean }`.
- `PATCH` calls xvm-api's settings endpoint with `approval_required: !enabled` and sends `approve_pending=true` only when `enabled` is `true`.
- The route uses `withVenueAction`; xvm-api enforces Manager tier.
- Errors go through `xvmApiErrorResponse`.

Add `getShiftSettings` and `updateShiftSettings` to `apps/web/lib/api/xvm-api.ts`, including the optional `approvePending` argument on the update call.

## UI

Add a small client component, `apps/web/components/shift-approval-settings.tsx`, rendered as an Operations row in `apps/web/app/dashboard/[slug]/settings/page.tsx`.

- Label: **Auto-approve shift claims**.
- Description: new claims take their seat immediately; enabling also approves claims already waiting.
- `Switch` saves immediately, not through the page's **Save changes** button.
- While saving, disable the switch. On success, show a toast and keep the new state.
- On failure, restore the previous state and show the error toast.
- If settings cannot load, show the row disabled with a short error, matching the settings page's existing xvm-api-degraded treatment.
- Add no other shift settings to this pass.

Immediate save is deliberate: the page's shared save path sends owner-only fields, which can reject a manager's save even when the manager is allowed to change this setting.

## Testing

xvm-api:

- Defaults stay unchanged for callers that omit `approve_pending`.
- `approve_pending=true` approves pending one-off and event shifts, stamps the actor, writes audit rows, and refreshes event posts.
- Cancelled, started, ended, and already-approved claims are left alone.
- `approve_pending=true` without `approval_required: false` still approves eligible pending rows.
- Staff are refused; managers and owners succeed.
- A failure rolls back both the setting and the approvals.

Dashboard:

- Proxy route tests for GET mapping, PATCH mapping, `approve_pending` only on enable, and xvm-api errors.
- Manual check against the local stack: toggle on approves the synthetic pending seat, toggle off makes a new claim pending again.

## Out of scope

- Bulk approval as a standalone manager action.
- Notifications to members whose pending claims are bulk-approved.
- Exposing `lockout_minutes`, `start_reminder_minutes`, or `qualification_required` in the dashboard.
- Changing the approval flow for profile submissions, which uses a separate setting.
