# 08 — Shortcut Library and Habit Map

> Slot 08 (project-specific) of the definition set for **cmdnudge**. Data model summary: [`03-architecture.md`](03-architecture.md). Features: [`02-features.md`](02-features.md).
> Standard: blueprint `docs/standards/project-docs-instruction.md`.

## Two kinds of data, kept apart

1. **Action library** — what exists: actions, app families, bindings per platform. Shared with Mac Mouse Fix NG.
2. **Habit map** — what a Windows habit looks like **when it arrives on a Mac**, per layout and keyboard type, and which action it meant. cmdnudge only.

Lesson from prior art (`context/03-prior-art-research.md`): big hand-kept lists kill projects. So:
- Mac app shortcuts come **live from the menu bar** where possible.
- The curated part is the habit map (target: ~300 rules for the first release, ~50 for P0) plus system shortcuts that have no menu item (Spotlight, screenshots, Mission Control, text navigation).

## Schema (JSON in `packages/library`)

```json
{
  "actions": [
    { "id": "system.screenshot.area", "label": "Screenshot of an area", "category": "system", "destructive": false }
  ],
  "appFamilies": [
    { "id": "files", "mac": ["com.apple.finder"], "windows": ["explorer.exe"] }
  ],
  "bindings": [
    { "action": "system.screenshot.area", "family": "system", "platform": "mac",
      "chord": "cmd+shift+4", "layouts": ["us", "de", "at"],
      "sourceURL": "https://support.apple.com/en-us/102650", "verifiedOn": "2026-11-06" },
    { "action": "system.screenshot.area", "family": "system", "platform": "windows",
      "chord": "win+shift+s", "layouts": ["*"], "sourceURL": "…", "verifiedOn": "…" }
  ],
  "habitRules": [
    { "id": "de.apple.at-sign", "layout": "de", "keyboard": "apple",
      "arrives": "rcmd+q", "meant": "type.at-sign", "macWay": "opt+l", "guard": true }
  ]
}
```

Rules the checker enforces (pattern from MMF NG's `check_library.py`):
- every binding has `sourceURL` + `verifiedOn`, or is marked unverified and shown with a ring badge;
- habits name only layouts from `src/layouts.json`; every typing rule that lands on a destructive chord is guarded;
- `guard: true` only on rules whose arriving chord is destructive on the Mac;
- no binding duplicates another for the same action × family × platform × layout.

## Layouts (#33)

`src/layouts.json` lists one entry per layout (US, German QWERTZ, Swiss German/French, British
and British – PC, French and French – PC, Belgian, Spanish, Italian, Portuguese, Swedish/Finnish,
Norwegian, Danish, Polish – Pro, Czech, Hungarian, and `other`), each with the Mac input sources
it covers and the Windows layout DLL its AltGr layer comes from. German and Austrian are one
layout. Variants whose characters sit elsewhere (Spanish – Legacy, Italian – QZERTY, Swedish –
Legacy, Czech/Hungarian QWERTY, ABC – QWERTZ) are `other` until someone asks.

Nothing about keys is typed in by hand:
- `src/mac-layouts.json` is measured with `tools/dump-mac-layouts.swift` (UCKeyTranslate, no dead
  keys): keycode → base, Shift, Option, Option+Shift.
- `src/windows-altgr.json` is imported with `tools/import-klc.mjs` from the Microsoft Keyboard
  Layout Creator files at kbdlayout.info.
- `tools/layouts.mjs` turns every AltGr character people type (@ € { } [ ] \ | ~ µ # ` ^ < > $ £ &,
  Polish letters on Polish) into a habit: `altgr+<Mac keycap at that physical key>` → the easiest
  Mac chord that types it. A test checks the synthesis reproduces the hand-verified German rows.
- The Option chords of the taught characters are reserved on that layout (pressed on purpose).
- Keycap labels follow one rule in the generator and in `keymap.rs`: the unshifted character, or
  the digit when the digit is on Shift (AZERTY number row). The app reads keycaps of the active
  layout at runtime with UCKeyTranslate, so `other` layouts get correct shortcuts too.

## Physical keyboard matters

| Windows habit (DE) | Apple keyboard on Mac sends | PC keyboard on Mac sends | Meant | Mac way |
|---|---|---|---|---|
| AltGr+Q (@) | right ⌘Q → **quits app** | ⌥Q (types «) | @ | ⌥L |
| AltGr+E (€) | right ⌘E | ⌥E | € | ⌥E |
| Ctrl+C | ⌃C (nothing) | ⌃C | Copy | ⌘C |
| Alt+Tab | ⌘Tab (works) | ⌥Tab (nothing) | Switch app | ⌘Tab |
| Win+E | ⌥E (types €) | ⌘E | New Finder window | ⌥⌘Space |
| Win+Shift+S | ⌥⇧S | ⌘⇧S (Save As in many apps) | Area screenshot | ⌘⇧4 |

Modifier positions: on an Apple keyboard the keys next to the space bar are ⌘ (where Windows has Alt) and ⌥ (where Windows has the Win key). On a PC keyboard used with a Mac, the Win key acts as ⌘ and Alt as ⌥. Hence keyboard type is a key in every habit rule (D13). Rows above are the design intent; every row must be **measured** on real hardware before it ships (MMF NG's `layouts.md` method), see **Open-8**.

The Win+E row also corrects the owner's original example (`context/01-original-idea.md`): ⌘Space is Spotlight; ⌥⌘Space opens a Finder window.

## Seeds

1. Mac Mouse Fix NG `docs/features/shortcut-research/data/shortcuts.json` (1,161 Mac entries, 48 apps, 1,122 verified) for Mac bindings. Licence question **C5**.
2. Windows habits: Karabiner Windows configs (`m3au/karabiner`), `pcfy-my-mac`, Apple's "Switched from Windows" pages, Microsoft's Windows shortcut pages. Licences checked before copying; facts re-verified at the vendor source.
3. KeyMap / CtrlHelp data only where the licence allows.

## Sharing with Mac Mouse Fix NG

`packages/library` is the single source. MMF NG's generator (`gen_library.py`) reads the Mac bindings of the action library and keeps its own `mouseSuitable` and `suggested-mappings` overlay. Action ids are shared, so a later "bind this action to a mouse button" link works ([`05-phase2-directions.md`](05-phase2-directions.md)). Whether the data lives in this repo or in a separate data repo is decision D16.
