# 09 — Input Capture and Privacy

> Slot 09 (project-specific) of the definition set for **cmdnudge**. Invariants 1, 4 and 5 of [`01-project-description.md`](01-project-description.md) live here. Architecture: [`03-architecture.md`](03-architecture.md). Landing claims depend on this doc: [`07-landing-copy-strategy.md`](07-landing-copy-strategy.md).
> Standard: blueprint `docs/standards/project-docs-instruction.md`.

## What counts as a key combo (the filter)

An event is kept **only** if one of these holds:
- ⌘, ⌃ or ⌥ (Win, Ctrl, Alt, AltGr on Windows) is held; Shift alone does not count;
- the key is a function key (F1–F24), Escape with a modifier, or a navigation key (Home, End, Page Up/Down, arrows) **with a modifier**, or Home/End/Delete-forward alone (classic Windows habits).

Everything else is dropped **in the event callback, before any queue, log or store**. The filter is one small, separately tested function, and the landing page links to it.

Even a kept combo is stored only as a counter of a library action (`habit_miss`, `mac_correct`, `menu_by_mouse`, `win_use`). A combo that matches no action is dropped too. A local "unknown combos" list for improving the library is **off** by default and never synced (D17).

## Never stored, never sent

- characters, text, key sequences, timing between keys;
- window titles, document names, URLs;
- per-keypress timestamps (days only, invariant 5);
- anything during secure input (Mac password fields: macOS blocks taps anyway; the app also checks `IsSecureEventInputEnabled`);
- on Windows: anything while an elevated or credential window (UAC, Windows Security) is in front.

## Permissions

| Platform | Permission | Why | Without it |
|---|---|---|---|
| Mac | Input Monitoring | listen-only event tap | app cannot coach |
| Mac | Accessibility | blocking (guard, strict, translate), menu reading, menu-by-mouse | toast-only works, guard and menu features off |
| Windows | none special | low-level hook runs as user | — |

**Contradiction flagged (C4):** the guard is on by default, but blocking needs Accessibility, which is a heavier permission than the toast-only default suggests. Onboarding asks for both and explains that without Accessibility the guard cannot work.

## Excluded apps by default

Terminal apps, remote desktop clients, VM hosts (Parallels, VMware, UTM), Citrix. Windows shortcuts are correct there (D11). The list is editable.

Built-in terminals of code editors (#30): when a Ctrl habit fires in another app, the app asks Accessibility for the focused element's `AXDOMClassList`; xterm.js's `xterm-helper-textarea` (VS Code, Cursor, other Electron terminals) means "terminal", and the Terminal switch applies. Only the class list is read, never the element's value or title, and nothing is kept. Native editor terminals (Zed) are not recognised.

## Kept shortcuts (#29)

The user can keep a Windows shortcut on purpose, in one app or everywhere: no hint, no slip counted, nothing changed by translate or strict. Guards cannot be kept. The entry (habit id, app bundle id and name, display text) lives in the local settings JSON, by the user's own choice; it is not synced and is listed in Settings with Remove.

## Sync privacy

- Hosted: Clerk account (email) + counter rows. The privacy page lists exactly these fields. Account deletion deletes all rows at once.
- File sync: nothing leaves the user's own cloud folder.
- **Contradiction flagged (C3):** "transparent source code proves no personal data is logged". Code shows intent; builds from public CI with checksums (D15) make the claim checkable, not proven.

## Tests that must exist

- Filter: plain letters, Shift+letter, digits, space, Return never pass; Ctrl+C, ⌘C, AltGr+Q, F2, Alt+F4 pass.
- Store: after a scripted session of typed text + shortcuts, the database contains only counter rows of library actions.
- Sync payload snapshot: no field outside the documented row format.
- Secure input: no event is processed while it is enabled.
