---
name: gallery-notes
description: Work through the design notes left on gallery components — read the batch with `pnpm gallery:notes`, fix each one in the real component, refresh the affected screenshot baselines, and delete the notes that were answered in the same commit. Use when the user asks to action, work through, or clear gallery notes, or says they have left notes in the gallery.
---

# gallery-notes

Notes are written while browsing the gallery, one at a time, and spent all at
once. This skill is the spending pass.

## Read the batch

```bash
pnpm gallery:notes
```

Each note carries an id, a scope, the note text, and the cell it was written
from:

- **`component`** — the fix applies wherever the component renders. Change the
  component.
- **`cell`** — the fix applies to one fixture, theme, or width. Usually that
  means the fixture is wrong or missing a case, not the component.

The `Decided already` section is a standing record of choices the owner has
made. Do not re-propose anything in it, and do not undo it to satisfy a new
note without asking.

## Work through them

For each note, in component order:

1. Open the cell it names to see the problem:
   `pnpm gallery` then `#/gallery/<cell>/specimen`. The cell string is exactly
   the route minus the view mode.
2. Fix it in `packages/ui/src/<component>/`. A note is design feedback, not a
   spec — if the note's fix would break another fixture, say so and propose
   the alternative rather than shipping a regression.
3. Delete the note from `<component>.notes.json`. Delete the file when it
   empties; do not leave `{"open": [], "decided": []}` behind.
4. If the owner decided against the note during the pass, move it to
   `decided` with a `why` instead of deleting it, so it does not come back.

Do not batch-edit the JSON first and fix afterwards. A note is deleted because
its fix exists, and the two belong in the same commit.

## Close the loop

Any change to a catalogued component moves its screenshot baselines:

```bash
pnpm --filter @nod/gallery test          # derived catalog tests
pnpm --filter @nod/gallery shots:update  # darwin baselines, local
pnpm check                               # ultracite, the CI gate
```

Linux baselines only regenerate in CI. Push the branch, let `Gallery shots`
go red, download the `gallery-linux-baselines` artifact, and commit it — the
job's error message names the artifact.

Review the refreshed diffs before committing them. A baseline that moved in a
cell no note mentioned is a regression, not a refresh.

## Report

Say what was fixed, what was left, and why. A note you could not action stays
in the file — leaving it there is the correct outcome, and silently dropping
it is not.
