# Native dialogs to the shared ones

`alert()` and `confirm()` are used in 13 files, 28 call sites. A native dialog looks foreign beside the XIV theme, blocks the page and cannot be styled or tested. The shared pieces already exist: the root layout mounts sonner's `Toaster`, and `AlertDialog` is how the rest of the app confirms a destructive action.

## Shape

1. Each `alert(message)` becomes `toast.error(message)`. All 27 are a failure or a refusal, none is a question.
2. The one `confirm()` (revoking an xvm-api credential) becomes an `AlertDialog` around the Revoke button, written like `delete-event-button`: Cancel, and a destructive action. `revoke` loses its `confirm` guard.
3. A file that did not import `toast` from `sonner` gets the import.

## Not doing

- Changing what any message says, or where a failure is handled. A toast replaces the dialog and nothing else moves.
- The pages' own inline error banners (`setError`). They are a separate pattern, not a native dialog.

## Checks

`tsc`, lint, the suite, no `alert(` or `confirm(` left under `app`, `components` or `lib`, and a click-through of the revoke dialog plus one toast against the local stack.
