# 01 — Project Description

> Slot 01 of the definition set for **cmdnudge**. Read this first.
> Standard: blueprint `docs/standards/project-docs-instruction.md`.
> Sources: [`cmdnudge-brief.md`](cmdnudge-brief.md), `context/01-original-idea.md`, `context/02-interview-answers.md`, `context/03-prior-art-research.md`.

## The idea

cmdnudge is a free, open-source background app for macOS and Windows that turns Windows shortcut habits into Mac muscle memory.

- **On the Mac (the coach):** it watches key combinations only. When you press a Windows habit in the frontmost app (Ctrl+C in Chrome, Win+E, Win+Shift+S, Alt+Tab, Ctrl+Left), a small toast shows the Mac shortcut for the same action in that app. The key itself passes through unchanged. Destructive collisions are the exception: they are blocked, and the toast explains (see invariant 2).
- **Also on the Mac:** when you pick a menu item with the mouse that has a shortcut, it can tell you the shortcut ("you could have pressed ⌘⇧T").
- **On Windows (the recorder):** it counts which shortcuts you use, in which app, so the coach knows which habits matter most to you.
- **Across both:** progress syncs, through an account (default) or a shared folder (no account).

## Who it is for

- **Primary:** people moving from Windows to Mac, often keeping a Windows PC at work or home. The owner is one of them and uses both systems every day.
- **Secondary:** people who switch back and forth daily; IT teams that point new Mac users at a download (no B2B product).
- **Not for:** people who want the Mac to behave like Windows forever (use Karabiner or a remapper), and Mac natives who want a cheat sheet (KeyCue, KeyClu exist).

Details and persona: [`07-landing-copy-strategy.md`](07-landing-copy-strategy.md).

## The problem, in the owner's words

> "From slow and clumsy to annoyed and desperate. Closing apps with CMD+Q whenever you want to tag somebody mid conversation and then not fi Ding your app back quickly is a nightmare. Having to think how to make a screenshot every time when you want to show someone something quickly is agonizing. The worry of not knowing how long unlearning and relearning takes can cause feelings of regret" (`context/02-interview-answers.md`)

The Cmd+Q case is a **layout trap**, not a typo: on a German or Austrian Windows keyboard "@" is AltGr+Q. On an Apple keyboard, the key in AltGr's position is right Cmd, so the "@" habit sends Cmd+Q and quits the app. On a Mac the German "@" is Option+L. This one example shows why the product needs layout and keyboard awareness ([`08-shortcut-library-and-habit-map.md`](08-shortcut-library-and-habit-map.md)).

**In numbers:** none measured yet. The research found no product that does this (`context/03-prior-art-research.md`). Switcher guides estimate that relearning takes "a week or two" for basics; that is unverified and is exactly the worry the product should replace with visible progress ([`06-metrics-and-analytics.md`](06-metrics-and-analytics.md)).

## Success criteria

1. **The demo moment works:** in Chrome or Finder, a Windows habit shows the correct Mac toast within 150 ms, without stealing focus.
2. **The Cmd+Q trap is caught:** the right-Cmd+Q from the "@" habit on a German/Austrian setup is blocked, and the toast shows ⌥L.
3. **The owner's own misses go down:** the owner's Windows-habit misses per active hour fall by half within 4 weeks of daily use (measured locally, [`06-metrics-and-analytics.md`](06-metrics-and-analytics.md)).
4. **Privacy can be verified:** no typed text, window title or key sequence is ever stored or sent, and the code that enforces this is short and easy to point to ([`09-input-capture-and-privacy.md`](09-input-capture-and-privacy.md)).
5. **Public release:** a signed and notarized Mac download and a Windows installer, linked from cmdnudge.com, MIT-licensed on GitHub.

## Non-goals

- Remapping Windows shortcuts to Mac ones as a permanent setting. A translate mode may exist, but it is never the default ([`02-features.md`](02-features.md)).
- Covering every shortcut of every app. The curated part is the Windows→Mac **habit map**; Mac app shortcuts are read live from menus ([`08-shortcut-library-and-habit-map.md`](08-shortcut-library-and-habit-map.md)).
- Usage telemetry, ads, payments, leaderboards ([`06-metrics-and-analytics.md`](06-metrics-and-analytics.md)).
- Practice drills, more layouts, Linux in the first release ([`05-phase2-directions.md`](05-phase2-directions.md)).
- Merging with Mac Mouse Fix NG. The two share **data** (the shortcut library), not code or an app.

## Most likely to be lost in translation

These invariants are repeated wherever they bite.

1. **Never record text.** Only key combinations with ⌘, ⌃ or ⌥ (Shift alone does not count), or function and navigation keys. No characters, no sequences, no window titles. ([`09-input-capture-and-privacy.md`](09-input-capture-and-privacy.md))
2. **A coach, not a remapper.** By default only a toast is shown and the key passes through unchanged. Only destructive collisions are blocked by default (the Cmd+Q / Cmd+W family), and that can be switched off. ([`02-features.md`](02-features.md), [`04-design.md`](04-design.md))
3. **Map by action, not by key, and respect the physical keyboard.** The same habit produces different Mac key combos depending on the layout (US/DE/AT) and keyboard type (Apple or PC). ([`08-shortcut-library-and-habit-map.md`](08-shortcut-library-and-habit-map.md))
4. **The toast never takes focus.** A toast that activates its window breaks the very shortcut the user is about to try. ([`04-design.md`](04-design.md))
5. **Only counts and progress leave the device.** Never per-keypress timestamps. ([`03-architecture.md`](03-architecture.md))
