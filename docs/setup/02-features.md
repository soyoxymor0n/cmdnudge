# 02 — Features

> Slot 02 of the definition set for **cmdnudge**. **This is the build contract.** Where another doc disagrees, this one wins; deferred items live in [`05-phase2-directions.md`](05-phase2-directions.md).
> Standard: blueprint `docs/standards/project-docs-instruction.md`.

## Priority legend

- **[P0]** the demo moment. Nothing ships without it.
- **[P1]** part of the first public release (the owner put these in it, `context/02-interview-answers.md`).
- **[P2]** in the first release if the budget holds, otherwise the first update.
- **[Phase 2]** deliberately deferred, see [`05-phase2-directions.md`](05-phase2-directions.md).

## Budget and deadline reality

**Amendment 2026-11-06:** the owner set the target "everything built tonight, as far as possible, ready to be used tomorrow on mac" (Open-1 in [`cmdnudge-open-questions.md`](cmdnudge-open-questions.md)). Realistic for one night: the Mac P0 for the owner's own machine (local signing, no notarization, no sync, no Windows). Everything P1 follows. Estimated effort for a solo owner working with Claude:

| Block | Person-days |
|---|---|
| Mac capture, frontmost app, habit matching, toast, guard [P0] | 7 |
| Habit map + action library data, 18 layouts (#33), checker [P0/P1] | 4 |
| Stats screen + missed list + mastered logic [P1] | 3 |
| Mouse-to-menu hints [P1] (needs the prototype first, **Open-3**) | 3 |
| Windows recorder [P1] | 4 |
| Sync: hosted (account) + file sync [P1] | 5 |
| Landing page on cmdnudge.com, privacy page [P1] | 2 |
| Signing, notarization, installers, release pipeline [P1] | 3 |
| Tests and hardening across both platforms | 3 |
| **Total** | **≈ 34** |

**Contradiction, flagged (C1 in [`cmdnudge-open-questions.md`](cmdnudge-open-questions.md)):** the brief's MVP rule says "Must = the demo moment, everything else Should/Later", but the owner then put every Should into the first public release. P0 alone is about 11 days; the full first release is about 34. The release order below lets a P0-only build reach the owner's own machine within two weeks, while the public release waits for the P1 set.

**Scope-creep traps, named:**
- Curating Mac app shortcuts by hand instead of reading menus live. That is what Mouseless and CheatSheet died of (`context/03-prior-art-research.md`).
- Building the hosted sync backend before file sync proves the merge model ([`03-architecture.md`](03-architecture.md)).
- Adding more layouts before US/DE/AT are right.
- Gamification (badges, streak pressure, sharing). Out, see [`06-metrics-and-analytics.md`](06-metrics-and-analytics.md).

## In scope

### Mac coach

- **[P0] Habit detection.** Listen to key combos, look up the frontmost app (bundle ID → app family), match against the habit map, show a toast "Ctrl+C → ⌘C · Copy". The key passes through unchanged (toast-only mode). Rules: [`08-shortcut-library-and-habit-map.md`](08-shortcut-library-and-habit-map.md), capture: [`09-input-capture-and-privacy.md`](09-input-capture-and-privacy.md).
- **[P0] Destructive-collision guard.** Block Cmd+Q, Cmd+W, Cmd+Option+W, Cmd+Shift+Q, Cmd+Delete in Finder and similar keys **when they come from a known Windows habit** (for example right Cmd+Q from AltGr+Q on DE/AT). Show the toast with the right key (⌥L for @). On by default, can be switched off. Deliberate Cmd+Q with left Cmd stays untouched (D7).
- **[P0] Correct-use counting.** When you press the Mac shortcut for a tracked action, count it: this is what moves an action toward "mastered".
- **[P0] Pause.** Menu bar icon: pause for 1 hour / until tomorrow; auto-pause during secure input.
- **[P1] Layouts** (#33). 18 layouts with typing habits (US, German QWERTZ, Swiss German/French, British, French, Belgian, Spanish, Italian, Portuguese, Nordic, Polish, Czech, Hungarian); any other layout gets shortcuts with runtime keycaps and a link to ask for its AltGr characters. Guards for Czech/Hungarian AltGr+Q/W (right ⌘Q/⌘W).
- **[P1] Keep a shortcut** (#29). Point at a hint (or use Recent hints in the menu bar) to keep that Windows shortcut in this app or everywhere: no hint, no slip. Kept list in Settings. Built-in editor terminals count as terminals (#30). **Suggest keeping** (#31): the same Windows shortcut in the same app, 5 times on at least 2 days, never followed by the Mac way within 10 s, makes the next hint ask "looks deliberate. Keep it?" with Keep in <app> / Keep everywhere / Not now under it. No toast of its own; guards never ask. After "Not now" or no answer it asks again after 20 more such uses.
- **[P1] Learning mode setting:** toast only (default), translate + toast, strict. The guard applies in all three.
- **[P1] Mouse-to-menu hints.** When a menu item with a shortcut is picked with the mouse, show "you could have pressed ⌘⇧T", only after the same item has been used 3 times by mouse (Key Promoter X threshold, D8). Depends on prototype **Open-3**.
- **[P1] Stats screen + missed list.** Top habits still costing you (per app family), streaks, mastered actions, trend of misses per active hour. Design: [`04-design.md`](04-design.md).
- **[P1] Onboarding.** Permissions (Input Monitoring, Accessibility), keyboard type and layout check, a first test ("press Ctrl+C now").

### Windows recorder

- **[P1] Usage counting.** Keyboard hook + foreground process → app family. Counts key combos per app family and maps them to actions. No toast by default (D10).
- **[P1] Ranking.** The Mac coach's missed list is ordered by real Windows usage once data has synced.
- **[P2] Optional preview toast on Windows** ("on the Mac this is ⌥⌘Space") for people preparing a switch. This was the original idea in `context/01-original-idea.md`, see C2.

### Sync

- **[P1] Hosted sync (default):** sign in with an account; only counts and progress are sent (invariant 5 in [`01-project-description.md`](01-project-description.md)). Architecture: [`03-architecture.md`](03-architecture.md).
- **[P1] File sync (no account):** both machines point at one shared folder (iCloud Drive, OneDrive, Dropbox); each device writes its own file.
- **[P1] Export / import** of the same file format, as a manual fallback.

### Shortcut library

- **[P0] Habit map** for about 50 universal habits (system + Finder/Explorer + browsers) with US/DE/AT variants, sources and verified dates.
- **[P1] Action library shared with Mac Mouse Fix NG**, as a separate data package that MMF NG also reads ([`08-shortcut-library-and-habit-map.md`](08-shortcut-library-and-habit-map.md)). Licence question C5.
- **[P1] Live menu reading** of the frontmost Mac app for app-specific Mac shortcuts.

### Web

- **[P1] Landing page** on cmdnudge.com: hero, how it works, privacy ("read the code"), downloads, footer link to Mac Mouse Fix NG. Copy: [`07-landing-copy-strategy.md`](07-landing-copy-strategy.md).
- **[P1] Privacy page** (an account exists, so a privacy page is required; `legal-pages` standard). Imprint per house standard.

## Deferred

All in [`05-phase2-directions.md`](05-phase2-directions.md): practice drills, more layouts, Linux, per-team rollout, community data contributions in the app, binding an action to a mouse button through MMF NG.

## Out

- Permanent remapping as a product goal (non-goal in [`01-project-description.md`](01-project-description.md)).
- Telemetry, accounts for anything other than sync, payments.
- Text expansion, macros, window management.
