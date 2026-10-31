# Forms on the shared primitives

Stacked on #311. Step 2 of making the dashboard use its shared components consistently. After the removals in #311, the raw `<input>`, `<select>`, `<textarea>` and `<label>` left on the venue pages are small enough to convert in one go.

## Shape

- A raw text or number `<input>` becomes `Input`, a `<textarea>` becomes `Textarea`, a checkbox becomes `Checkbox`, and the Enabled or Disabled toggle becomes `Switch`, with `Label` around them where the markup had a `<label>`.
- A native `<select>` becomes the shared `Select`, written like the district select on the same settings page. Radix cannot hold an empty-string item, so "None", "No category" and "Any" use a sentinel value that maps back to the old empty value.

## Not doing, and why

- The tag box on the settings page. It is a borderless input inside a chip container on purpose.
- Colour, file and range inputs. There is no shared equivalent.
- The six search boxes. Four take their look from the global `.search` CSS and two copy it inline, each with a hand-drawn magnifier. They want a shared search field, which is a design decision.
- The get-started wizard. Its fields are styled by the `gs-inp` and `gs-sel` classes from an onboarding stylesheet, so moving them changes the look of that flow.
- `account/settings`'s `.field-label` and `.field-hint` text classes.

## Checks

`tsc`, lint, the suite, and a click-through of each converted control against the local stack.
