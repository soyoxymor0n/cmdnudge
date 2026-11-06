# 04 — Design

> Slot 04 of the definition set for **cmdnudge**. Features: [`02-features.md`](02-features.md). Landing copy: [`07-landing-copy-strategy.md`](07-landing-copy-strategy.md). Brand: not yet made (`brand-identity` skill, **Open-6**).
> Standard: blueprint `docs/standards/project-docs-instruction.md`.

## The toast is the product

Everything else is settings. Rules:

1. **Never takes focus** (invariant 4 in [`01-project-description.md`](01-project-description.md)). Non-activating panel, ignores the mouse except for a small "×" and "don't show for this app" menu.
2. **Content in reading order:** what you pressed → what to press → what it does. `Ctrl+C → ⌘C · Copy`. App icon on the left when the hint is app-specific. Mac symbols (⌘⌥⌃⇧) for the Mac side, Windows names (Ctrl, Alt, Win) for the Windows side, so you can tell them apart at a glance.
3. **Position:** bottom right by default (the owner's original picture, `context/01-original-idea.md`), 16 pt from the screen edge, on the screen with the frontmost window. Top right is avoided because macOS notifications appear there.
4. **Timing:** appears within 150 ms; stays 2.5 s, plus 1 s per extra key; a repeated miss of the same habit within the display time extends it instead of stacking. At most one toast at a time.
5. **Guard toast** (blocked destructive key): same place, warning colour, and words that say what was prevented: `Blocked ⌘Q (would quit Slack) · for @ press ⌥L`.
6. **Mouse-to-menu hint:** neutral colour, the word "Tip" as a prefix, shown only after the threshold (D8).
7. **Size:** short text, one line, two at most; large enough to read at a glance (17 pt key symbols).
8. **Motion:** fade + 8 pt slide. Respects "Reduce motion".

## Learning without nagging

- Hints for Windows habits show **every time**: the slip has just happened, so this is exactly the moment to learn.
- Once an action is **mastered**, its hint turns quiet (smaller, 1.5 s) and stops entirely after 30 days without a miss. Mastered rule in [`06-metrics-and-analytics.md`](06-metrics-and-analytics.md).
- **Pause** is always one click away in the menu bar / tray. Auto-pause during secure input (passwords) and optionally when screen sharing apps are in front (**Open-7**).

## Screens (desktop app)

1. **Onboarding** (3 steps): why the permissions are needed and what is never recorded (link to the code) → permissions → "press Ctrl+C now" test showing a real toast.
2. **Stats:** "Habits still costing you" (top 10, per app family, with the Windows usage rank once synced), mastered list, misses per active hour trend (local daily aggregates).
3. **Settings:** mode, guard, toast position, pause, keyboard type override, layout, sync (account / folder / off), export/import, "what is stored" (shows the raw rows).
4. **Menu bar / tray menu:** status, pause, open stats, last 5 hints.

## House standards

| Standard | Applies to | How |
|---|---|---|
| `interface-polish` | desktop screens + web | control heights, empty states (stats before the first miss: "Nothing yet. Work as usual"), colour tokens |
| `theme-toggle` | web + desktop UI | follows the system on the desktop; toggle on the web per the standard |
| `header-logo` | web | landing header tier per the standard |
| `product-tour` | desktop onboarding | the onboarding points at the real menu bar icon and settings, data-driven, can be skipped |
| `legal-pages` | web | privacy page (accounts exist), imprint |
| `ui-interview` | before building the stats screen | run before the screen is built |
| `admin-area` | not applicable | no admin surface in v1; sync rows are only reachable per user |

### Deliberate overrides

- **`feature-tips` (override).** The standard says tips are "earned by evidence of non-use, shown only in dead time". cmdnudge's toast is shown **at the moment of the slip**, which is the opposite of dead time. That is the product, not a tip, so the override is deliberate. The mouse-to-menu hint keeps the standard's spirit (evidence = 3 mouse uses).
- **`theme-toggle` on the desktop app.** No in-app toggle; the toast and screens follow the macOS/Windows appearance, like other menu bar utilities. The web keeps the standard toggle.

## Failure modes to design against

- A toast that steals focus, so the user's next shortcut goes to the toast window.
- A guard that blocks a deliberate Cmd+Q. Only habit-sourced combos are guarded (D7); the toast always says what was blocked and how to do it on purpose (left Cmd).
- Hint spam during fast typing of shortcuts in IDEs/terminals: per-app "don't show here" and a default exclusion list (terminal apps, remote desktop, VMs, where Ctrl is correct).
- Remote desktop / VMs / Parallels: Windows shortcuts are **correct** there. Default-exclude these app families (D11).
- Wrong layout guess shows wrong advice: show the layout used in settings, one-click correction in onboarding.
