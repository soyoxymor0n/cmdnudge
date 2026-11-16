# cmdnudge: next-level review, 2026-11-16

> Run of the workspace's module-next-level standard on `beta` at 3fea2bc (`origin/beta`, 2026-11-16).
> Branch: `claude/module-next-level-cmdnudge`. No product code changed.
> Companion docs: [`docs/cmdnudge-features.md`](../cmdnudge-features.md) (verified state) and
> [`docs/cmdnudge-next-level-plan.md`](../cmdnudge-next-level-plan.md) (phases and gates).

**Evidence labels.** VERIFIED: read today from a primary source, or checked by a test or command run today.
REPORTED: a secondary source (search summary, aggregator), or the owner's own note in `CLAUDE-HANDOFF.md`. Not re-checked here.
ESTIMATE: judgement or effort, not sourced.

## Answer first

- **What this is.** cmdnudge is a standalone menu bar app for macOS (Windows habits on a Mac, with a Windows keyboard recorder in progress). It is **not a RegOps module**: it is not in `packages/catalog/src/modules.ts` or in the RegOps suite catalogue (`regops-suite/src/data/catalog/modules.ts`), and there is no `project.json`. The run therefore uses the slug `cmdnudge` and skips the suite-placement step. Whether cmdnudge should be catalogued is an owner decision (below).
- **The build is in good shape.** Of 27 features and components in the spec, 16 are verified, 9 are committed but not fully verified, and 2 are planned. All checks passed: `npm test` 24 of 24, the generated habit library matches the committed file, the desktop UI builds, and `cargo test --locked` passes 61 with 2 ignored (both need a permission or a live screen, so they run by hand).
- **Three gaps in built features.** (1) The Stats screen has no streaks and no per-hour trend, which #11 specified ([#38](https://github.com/soyoxymor0n/cmdnudge/issues/38)). (2) During secure input the app stops quietly, but the menu bar never says so ([#41](https://github.com/soyoxymor0n/cmdnudge/issues/41)). (3) The destructive guard covers two arrivals (AltGr+Q/W), not the six chords the P0 text names; the owner decides which is the contract ([#39](https://github.com/soyoxymor0n/cmdnudge/issues/39)).
- **Missing tooling.** There is no `lint` script at the root or in the desktop app, so `npm run lint` fails. The standard expects one ([#40](https://github.com/soyoxymor0n/cmdnudge/issues/40)).
- **Market.** The closest products fall into three groups. Remappers change the shortcut and do not teach it: Windsify (paid, $14.99 one-time early-bird price shown on the vendor page), Kinto (free, GPL v2, Mac habits on Windows), and Microsoft PowerToys Keyboard Manager (free per its docs page, Windows only). Overlays show the Mac shortcuts while ⌘ is held but do not link them to a Windows habit: KeyCue, and KeyClu and Cheatsheet per search results. The mouse-to-keyboard tip model is Key Promoter X, which runs only inside JetBrains IDEs. No macOS tool was found that gives a keyboard tip after repeated mouse picks, but one search is not proof of absence.
- **Moat.** The verified per-layout habit data is the hard part to copy: 85 habits and 2,721 rules across 19 layouts and two keyboard types, with source URLs and a verified date for each habit, plus 473 rows recorded as dropped because the Windows key would type a character on that layout. None of the remappers read above describes such a check. The other differentiators are the privacy filter, which drops everything that is not a key combination before anything else sees it, and the Windows usage ranking (unverified on Windows hardware).
- **Onboarding.** The first hour is four steps inside the app, after a source build that the README says takes "a few minutes". The largest avoidable step is the build. The signed release path exists (#20, #23), but users still have to open the app once through System Settings.

## Scope and method

- Trunk: `origin/beta` 3fea2bc. Local `beta` was equal to it (0 ahead, 0 behind). The review ran in a separate worktree on `claude/module-next-level-cmdnudge`, so the shared checkout was not switched.
- Repo checks, run today: `npm test` (root), `npm run library` plus a diff against the committed `library.json`, `node apps/web/build.mjs`, `npm ci` and `npm run build` in `apps/desktop`, `cargo test --locked` in `apps/desktop/src-tauri`. These are the same steps `.github/workflows/ci.yml` runs. Results are in the features doc.
- Feature check: each feature in `docs/setup/02-features.md` was traced to code with `file:line` evidence, and to a test where one exists. Status words follow the standard: **verified** (a test or command run today covers it), **committed** (code on `beta`, with no test today covering the behaviour or the behaviour depends on hardware), **planned** (no code).
- Issues: open issues were searched first (11 open at the start, plus the closed F-series). Seven new issues were filed (#38 to #44). Two comments were added to existing issues (#20, #37).
- Regulation: none. cmdnudge makes no regulatory claim. The macOS permission wording (Input Monitoring, Accessibility) was not re-checked against Apple's pages in this run.

## Market research

Rows are per feature. Every vendor page was read on 2026-11-16 unless the label says REPORTED.

| Vendor / product | Feature | Label | Source | Note |
|---|---|---|---|---|
| Windsify | Windows shortcuts on a Mac (Ctrl+C/V, Alt+Tab, Alt+F4, Win opens search); Ctrl+C stays interrupt in standalone terminals | VERIFIED | https://windsify.com/ | Remaps; the page describes no hints |
| Windsify | Window snapping: half, quarter, fill, restore, multi-display moves; Pro only | VERIFIED | https://windsify.com/ | Window management is out of scope for cmdnudge |
| Windsify | Price: "$14.99 one-time", "Normally $19.99", labelled "Limited-time early bird · 25% off"; no end date shown | VERIFIED (price on the page today) | https://windsify.com/ | Price may change. Not an input to any cmdnudge price decision |
| Windsify | 14-day Pro trial; any Mac on macOS 15 or newer | VERIFIED | https://windsify.com/ | |
| Windsify | Hints or learning features | VERIFIED (absent from the page) | https://windsify.com/ | |
| Kinto (rbreaves) | Mac-style shortcuts on Windows and Linux by remapping the base modifiers system-wide; AutoHotkey on Windows, xkeysnail on Linux | VERIFIED | https://github.com/rbreaves/kinto | Runs the other way: Mac habits on Windows |
| Kinto | Licence GPL v2 | VERIFIED on the page; "GPL-2.0" in a search summary | https://github.com/rbreaves/kinto | |
| Kinto | Per-app configuration in files (`kinto.py`, `kinto.ahk`) | VERIFIED | https://github.com/rbreaves/kinto | No UI |
| Kinto | Activity: no release date shown; the author writes "Bug fixes will primarily be the only activity happening going forward" | VERIFIED (quote) | https://github.com/rbreaves/kinto | Maintenance mode, per the author |
| Kinto | Hints, overlays or cheat sheets | VERIFIED (absent from the page) | https://github.com/rbreaves/kinto | |
| SwitchKey (itsuhane) | Switches the input source per app. Not a shortcut tool | VERIFIED | https://github.com/itsuhane/SwitchKey | An aggregator described it as key mapping. The vendor page does not; dropped as a competitor |
| SwitchKey | Licence GPL-3.0; macOS only; "don't have to pay" | VERIFIED (licence, platform); REPORTED (free) | https://github.com/itsuhane/SwitchKey | |
| Microsoft PowerToys Keyboard Manager | Remaps keys and shortcuts, globally or for one process; text and app-launch actions | VERIFIED | https://learn.microsoft.com/en-us/windows/powertoys/keyboard-manager (updated 2026-07-30) | Windows only |
| PowerToys Keyboard Manager | "Mac and Linux profiles aren't included" | VERIFIED | same | |
| PowerToys Keyboard Manager | No effect on password screens; elevated windows need PowerToys elevated; not for games | VERIFIED | same | Same class of limit as secure input |
| PowerToys Keyboard Manager | Hints or teaching | VERIFIED (absent) | same | Price: free per general knowledge, not on the page read. ESTIMATE |
| KeyCue (Ergonis) | Holding ⌘ shows the frontmost app's menu shortcuts and the system-wide ones; search by typing the start of a chord | VERIFIED | https://www.ergonis.com/keycue (FAQ) | |
| KeyCue | Plans: one-time "Basic" for the current major version; "Advanced" and "Business" as subscriptions; no prices shown; version 11.2.1 in the download path | VERIFIED (absence of prices) | https://www.ergonis.com/keycue | Licence changed in v11 (REPORTED, search summary) |
| KeyClu, Cheatsheet | Hold ⌘ overlays of the frontmost app's shortcuts | REPORTED | search results, not opened | Treat as leads |
| Key Promoter X (JetBrains) | After a mouse click on an IDE action, shows its shortcut; suggests a shortcut after a set number of clicks; keeps a statistics window | REPORTED | https://plugins.jetbrains.com/plugin/9792-key-promoter-x (search summary) | IntelliJ platform only. cmdnudge's mouse-tip threshold (3, `menu_tips.rs:14`) is the same idea |
| Key Promoter X | A 2022 issue reports no tips for some Mac menu items | REPORTED | https://github.com/halirutan/IntelliJ-Key-Promoter-X/issues/94 (search result title) | Not opened |
| Mouse-to-keyboard tips on macOS | None found that tip after repeated mouse picks of a menu item | ESTIMATE | one search, 2026-11-16 | Not proof of absence |

## Competitor read-across

- **Remapping is the crowded lane.** Windsify, Kinto and PowerToys change what a key does. cmdnudge keeps the Mac way as the default and only teaches (non-goal in `docs/setup/01-project-description.md`). A user who wants remapping will go to these tools; the product's answer is "you do not have to change the keyboard".
- **Overlays exist; the Windows link does not.** KeyCue-style overlays show a Mac shortcut and stop there. cmdnudge can show the same overlay and say which Windows habit it replaces. That is a proposal, not built: [#44](https://github.com/soyoxymor0n/cmdnudge/issues/44).
- **Price.** Windsify sells one-time at $14.99 (early bird). No price for cmdnudge is proposed here: the owner decides price, and this run does not set it.

## The moat (what a competitor could not copy quickly)

Each claim labelled.

1. **Measured habit data per layout and keyboard.** `packages/library/dist/library.json` holds 2,721 rules for 85 habits across 19 layout entries (18 plus `other`) and two keyboard types. The generator (`packages/library/tools/generate.mjs`) derives where each Windows chord lands on a Mac, from measured layout tables (`mac-layouts.json`) and imported AltGr layers (`windows-altgr.json`). VERIFIED (counts from the generated file; `npm run library:check` prints "247 habits, 2721 rules" today).
2. **The typing-safety rule.** 473 rows are dropped where a Windows chord would type a character on that layout, so no hint fires on a key the user needs to type (`library.json` `dropped`; `habits.json` `reserved`). Remappers do not make this check. VERIFIED (counts). None of the remappers read above describes such a check. ESTIMATE: a new entrant would need weeks to reproduce this, judging from the spec's own effort estimates.
3. **Keycaps read from the active layout.** `apps/desktop/src-tauri/src/mac/keycaps.rs` reads the keycaps with UCKeyTranslate; unknown layouts fall back to `other` with shortcuts still working. VERIFIED (file exists; its ignored test needs a live layout, so the path is checked by hand, REPORTED from the handoff).
4. **Privacy by construction.** `filter.rs` drops everything that is not a key combination before the matcher sees it (`filter::tests::plain_typing_never_passes`, VERIFIED). Counts are per habit and app family, with no text. The README says so; that is a claim worth keeping true.
5. **Windows usage ranking.** The Mac ranks missed habits by real Windows use, after file sync (`sync::tests::a_windows_computer_adds_its_uses_to_the_mac_ranking`, VERIFIED). None of the products read above does this. It rests on the Windows hook, which has not run on Windows hardware ([#17](https://github.com/soyoxymor0n/cmdnudge/issues/17), committed, not verified).

**Weak spot.** The moat does not yet cover "less manual effort" in daily use: keyboard hints still read the static habit map, not the live menus (the spec's "Live menu reading" is built for mouse tips only, `mac/menus.rs:456`, VERIFIED).

## Onboarding: the first hour and the first cycle

**Install today (README, VERIFIED).** Install Xcode command line tools, Node 20+ and Rust; clone; `npm install`; `npm run install:local`, which builds and copies the app to `/Applications` ("Building takes a few minutes"). Then Input Monitoring and Accessibility are granted.

**In the app (VERIFIED, `apps/desktop/src/App.tsx:128-260`).** Four steps: What it sees, Permissions, Your keyboard (Apple or PC; layout auto, US, DE or AT), Try it ("Press Ctrl+C now", `App.tsx:232`).

**First cycle (VERIFIED from code).** Hints appear in a toast after a Windows habit; a correct Mac use counts; after five uses of one Windows shortcut in one app on two days, the next hint asks whether it is deliberate (`store.rs:80`, `should_ask` at `store.rs:306`).

**Where it can take fewer steps, ranked:**
1. **No build step.** A signed download replaces the source build. The self-signed path exists (decision #23; `release.yml:3-5`), but the first open still goes through System Settings → Privacy & Security → "Open Anyway" (#23 comment, VERIFIED). Largest saving. Tracked by [#20](https://github.com/soyoxymor0n/cmdnudge/issues/20), whose title is now out of date (see the comment on it).
2. **Layout step can default to auto.** The app already has `auto` (`settings.rs`, layout field). Showing the step only when the keycaps do not match would save one screen. ESTIMATE on the gain; needs a check on the owner's Austrian ISO keyboard.
3. **Two permission prompts** cannot be avoided; the app already says why (`App.tsx:177`).
4. **Hosted sign-in** is already one deep link (`hosted.rs`, `cmdnudge://link`, state-checked). VERIFIED.

## Open decisions for the owner

1. **Guard scope** (contract: six chords or two arrivals?). [#39](https://github.com/soyoxymor0n/cmdnudge/issues/39). Default if unanswered: the build as it is.
2. **Catalogue placement.** Is cmdnudge a suite module? Default: no; it stays a standalone product, and the suite-placement step is skipped.
3. **Feature doc.** `docs/setup/02-features.md` is the older build contract ("about 50 habits"; the build has 85). The new verified state is `docs/cmdnudge-features.md`. Keep both, or retire the old one?
4. **Shared action library licence (C5).** Needed before [#42](https://github.com/soyoxymor0n/cmdnudge/issues/42).
5. **Hold-⌘ overlay.** Does it fit the product's scope? [#44](https://github.com/soyoxymor0n/cmdnudge/issues/44).
6. **Price.** Out of scope; no price was set or proposed. Windsify's price is a market fact only.

## Sources

All read on 2026-11-16.

- Windsify: https://windsify.com/ (WebFetch)
- Kinto: https://github.com/rbreaves/kinto (WebFetch); licence and search summary (WebSearch)
- SwitchKey: https://github.com/itsuhane/SwitchKey (WebFetch); search summary citing https://sourceforge.net/app/switchkey/mac/ (not relied on)
- PowerToys Keyboard Manager: https://learn.microsoft.com/en-us/windows/powertoys/keyboard-manager (WebFetch)
- KeyCue: https://www.ergonis.com/keycue (WebFetch); search summary (WebSearch)
- Key Promoter X: https://plugins.jetbrains.com/plugin/9792-key-promoter-x and https://github.com/halirutan/IntelliJ-Key-Promoter-X (search summary; not opened)
- Mac menu tips search: one WebSearch, no relevant result.
- Owner's documents: `README.md`, `docs/setup/*.md`, `CLAUDE-HANDOFF.md` (dated 2026-11-06, partly stale), the closed and open issues named above.
- Code and data: as cited inline, at 3fea2bc.
