# cmdnudge action library

The data behind cmdnudge's hints: every action (copy, undo, close tab and so on) with the Mac
chords that perform it. Another app can read it, for example Mac Mouse Fix NG, to show the Mac
shortcut for a mouse action. It is data only: no code, no app.

## Files

- `manifest.json`: name, version, licence, and the sha256 of `actions.json`.
- `actions.json`: `{ "schema": 1, "actions": [ { id, label, category, destructive, mac } ] }`.
  `mac` lists the Mac chords for the action, as `modifier+modifier+key`. Modifiers are `ctrl`,
  `opt`, `shift`, `cmd`, and the sided `lopt`, `ropt`, `lcmd`, `rcmd`. `destructive` marks an
  action whose chord loses work when pressed by accident.
- `LICENSE`: MIT.

## Reading it

Check `actions.json` against `manifest.sha256`, then look actions up by `id`. For `edit.copy`,
`mac` is `["cmd+c"]`.

## Versions

The version is `SHARE_VERSION` in `tools/generate.mjs`. A major version when an action id is
removed or renamed, a minor version when actions are added, a patch version when a label or a
chord changes. `npm run library:check` validates the manifest and the file, and fails when they
are stale.
