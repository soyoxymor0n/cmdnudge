# cmdnudge: features, verified state (2026-11-16)

> Module-next-level run on `beta` at 3fea2bc. Written from code, tests and commands run on 2026-11-16.
> The build contract is still [`docs/setup/02-features.md`](setup/02-features.md); it is older and is not rewritten here (owner decision, see the research report).
> Research and evidence: [`docs/research/cmdnudge-next-level-2026-11-16.md`](research/cmdnudge-next-level-2026-11-16.md). Phases: [`docs/cmdnudge-next-level-plan.md`](cmdnudge-next-level-plan.md).

## Status words

- **verified**: a test or command run today covers the behaviour (`npm test`, `cargo test --locked`, the library checker, the web build), or the behaviour is shown in the built code path.
- **committed**: code is on `beta`, but no test today covers the behaviour, or it depends on hardware or a permission that was not exercised here.
- **planned**: no code.

"Hand test pending" means the owner has to try it on the Mac (or Windows) before it counts as used. The agent does not close issues.

## Results of the checks run today

| Check | Command | Result |
|---|---|---|
| Habit map and web tests | `npm test` (root) | 24 of 24 pass |
| Library checker | `npm run library:check` | `library ok: 247 habits, 2721 rules` |
| Library is up to date | `npm run library` then `git diff --exit-code` on `library.json` | no diff |
| Website build | `node apps/web/build.mjs` | `dist/` built |
| Desktop UI | `npm ci` and `npm run build` in `apps/desktop` (`tsc && vite build`) | builds; 24 modules transformed |
| Rust core | `cargo test --locked` in `apps/desktop/src-tauri` | 61 passed, 0 failed, 2 ignored |
| Lint | `npm run lint` at the root | fails: no `lint` script ([#40](https://github.com/soyoxymor0n/cmdnudge/issues/40)) |
| Root build | `npm run build` at the root | fails: no `build` script at the root (the desktop build is the one that counts) |

The two ignored Rust tests need a live screen recording (`mac::context::tests::screen_watcher_follows_a_recording`) and a live keyboard layout (`mac::keycaps::tests::reads_the_active_layout`). They run by hand.

## Mac coach

| ID | Feature (spec source) | Priority | Status | Evidence | Note |
|---|---|---|---|---|---|
| M1 | Habit detection and toast: key combo, frontmost app, match, non-activating toast | P0 | verified | `mac/tap.rs:42` (callback), `matcher.rs:37`, `engine.rs:261-271`, `mac/toast.rs`; `engine::tests::hint_toast_reads_in_order` | |
| M2 | Destructive-collision guard (right ⌘Q from AltGr+Q; on by default, switchable) | P0 | verified (narrow) | `engine.rs:290`, `settings.rs:63` (default on), `App.tsx:614-616` (switch); `engine::tests::guard_blocks_right_cmd_q_only`; `dist/library.json` guard rows: five, all AltGr+Q/W | Covers two arrivals, not the six chords the P0 text names. Decision [#39](https://github.com/soyoxymor0n/cmdnudge/issues/39) |
| M3 | Correct-use counting | P0 | verified | `matcher::tests::cmd_c_counts_as_correct_use`; `store.rs:147` (`record`) | |
| M4 | Pause: 1 hour, until tomorrow; auto-pause during secure input | P0 | committed | Manual: `lib.rs:199`, `:210`, menu `:553-554`, handlers `:694-695`. Secure input: `mac/tap.rs:58` returns every event untouched | The menu bar does not show the secure-input pause ([#41](https://github.com/soyoxymor0n/cmdnudge/issues/41)). Manual pause read in code only |
| M5 | Layouts: 18 with typing habits, plus `other` (runtime keycaps) | P1 (#33) | verified | `packages/library/src/layouts.json` (19 entries); `keymap::tests::every_layout_id_round_trips_and_matches_the_library`; checker | |
| M6 | Keep a shortcut in this app or everywhere (#29) | P1 | verified; hand test pending | `settings.rs:85-101` (`is_kept`, `keep`), `engine.rs:261-263`, `mac/toast.rs:269-271`, `:320` (buttons); `engine::tests::a_kept_shortcut_passes_unchanged_in_that_app_only`; `settings::tests::keep_in_one_app_or_everywhere` | Guards stay on when kept (`engine::tests::keeping_never_switches_off_the_guard`) |
| M7 | Editor terminals count as terminals: VS Code, Cursor, Zed (#30) | P1 | verified; hand test pending | `mac/focus.rs:62` (`in_terminal`), `engine.rs:269-271`; `engine::tests::editor_terminal_is_quiet_like_a_terminal_app` | Handoff: Ctrl+C in the VS Code terminal to be tried by hand |
| M8 | Suggest keeping after deliberate use (#31) | P1 | verified; hand test pending | `store.rs:80` (rule), `store.rs:294` (`record_deliberate`), `store.rs:306` (`should_ask`), `engine.rs:373` (question text), `mac/toast.rs:330`; `store::tests::asks_after_five_uses_on_two_days_then_every_twenty`; `engine::tests::deliberate_use_puts_the_question_into_the_hint` | |
| M9 | Learning modes: toast (default), translate, strict; guard applies in all | P1 | verified | `settings.rs` (`Mode`), `engine.rs:290-291` (strict blocks), `App.tsx:611`; `engine::tests::translate_mode_replaces_with_the_mac_chord` | |
| M10 | Mouse-to-menu hints after the third mouse pick of one item (#19, D8) | P1 | verified (synthetic clicks); real-mouse try pending | `menu_tips.rs:14` (`THRESHOLD = 3`), `:95` (`judge`), `:114` (`picked`), default on (`settings.rs`); `menu_tips::tests::tip_on_the_third_pick_then_quiet`; `mac/menus.rs:456` | Owner reports it working on macOS 26 on 2026-11-07 (REPORTED, handoff). Real-mouse try still to do |
| M11 | Stats screen: habits still costing you, streaks, mastered, trend of misses per active hour (#11) | P1 | committed (partial) | `App.tsx:284-345` (missed list, "Windows habits today" `:310`, "Mastered" `:312`) | Streaks and the trend are not built ([#38](https://github.com/soyoxymor0n/cmdnudge/issues/38)) |
| M12 | Onboarding: what it sees, permissions, keyboard and layout, "Press Ctrl+C now" (#10) | P1 | committed | `App.tsx:128-260` (four steps; `:232` the key check) | Read in code; not run in this review |
| M13 | Quiet in remote desktops and VMs (D11) | P1 | verified | `packages/library/src/families.json:21-24`; `matcher.rs:134` (test); `engine.rs:517` (no counting) | |
| M14 | No shortcut hints in terminals; typing guards still apply | P1 | verified | `matcher.rs:11`, `:37`; `engine.rs:269-271`; `matcher::tests::terminals_keep_typing_guards_but_drop_ctrl_hints` | |
| M15 | Quiet while the screen is shared (#24); counting continues | P1 | committed | `settings.rs:103` (`toasts_allowed`), `mac/context.rs:67` (`screen_shared`, private API looked up at run time), `App.tsx:634` (copy); `settings::tests::quiet_while_sharing_is_on_by_default_and_only_silences_toasts_when_shared` | The screen-watcher test is ignored (`context.rs:101`): checked by hand only |
| M16 | Live menu reading of the frontmost app for Mac shortcuts | P1 | committed (tips only) | `mac/menus.rs:456`, started at `lib.rs:669`; keyboard hints use the static habit map | Live reading for keyboard hints is not built |

## Windows recorder

| ID | Feature (spec source) | Priority | Status | Evidence | Note |
|---|---|---|---|---|---|
| W1 | Usage counting: keyboard hook, foreground app, habit chords (#17) | P1 | committed | `win/mod.rs:122` (`start`), `:144` (`SetWindowsHookExW(WH_KEYBOARD_LL)`); `win_recorder.rs:115` (`Recorder::new`), `:128`, `:132` (`family_of_exe`), `:139` (`action_for`) | The pure logic has tests (`win_recorder::tests`, verified). The hook has never run on Windows hardware. CI builds and tests it on Windows |
| W2 | Ranking the Mac's missed list by Windows use after sync | P1 | verified | `sync::tests::a_windows_computer_adds_its_uses_to_the_mac_ranking`; `App.tsx:291-292` (sort by `winUses`) | Needs W1 on real hardware to be used end to end |
| W3 | Optional Windows preview: "on the Mac this is ⌥⌘Space" | P2 | planned | No match for "preview" in `apps/desktop/src` or `src-tauri/src` | [#43](https://github.com/soyoxymor0n/cmdnudge/issues/43) |

## Sync and account

| ID | Feature (spec source) | Priority | Status | Evidence | Note |
|---|---|---|---|---|---|
| S1 | Hosted sync with an account (#18) | P1 | verified (tests); live sign-up pending | App: `hosted.rs:38` (`availability`), `:59` (`begin_link`), `:92` (`finish_link`), `:98` (`unlink`); `sync.rs:265` (`hosted_sync`). Web: `apps/web/api/sync.mjs`, `api/link.mjs`, `server/sync.mjs`, `server/link.mjs`; `apps/web/test/hosted.test.mjs` (5 tests, including an end-to-end sign-in and sync), `sync.test.mjs` (7 tests) | Live on cmdnudge.com (REPORTED, handoff). One real sign-up from the app is still to do (handoff, Next 4) |
| S2 | File sync: one `<device>.json` per computer in a shared folder (#16) | P1 | verified | `sync.rs:173` (`sync_folder`); `sync::tests::two_devices_sum_without_double_counting`; `sync::tests::a_file_cannot_overwrite_this_device_or_speak_for_another` | |
| S3 | Export and import of the same file format (#16) | P1 | verified | `sync.rs:141` (`export`), `:147` (`import`); `sync::tests::export_then_import_on_another_device` | |

## Shortcut library

| ID | Feature (spec source) | Priority | Status | Evidence | Note |
|---|---|---|---|---|---|
| L1 | Habit map: about 50 universal habits with US, DE, AT variants (spec); built as 85 habits | P0 | verified | `packages/library/src/habits.json` (85 entries; `verifiedOn` 2026-11-06); a source URL per habit in `packages/library/dist/library.json`; `npm run library:check` | The spec's "about 50" is out of date. The build is larger; `docs/setup/02-features.md` should say so |
| L2 | Action library shared with Mac Mouse Fix NG (licence C5 open) | P1 | planned | No reader in the local `/Developer/mac-mouse-fix` checkout (search for "cmdnudge" finds nothing) | [#42](https://github.com/soyoxymor0n/cmdnudge/issues/42). Blocked on C5 |

## Web

| ID | Feature (spec source) | Priority | Status | Evidence | Note |
|---|---|---|---|---|---|
| K1 | Landing page on cmdnudge.com (hero, how it works, privacy, downloads) | P1 | committed | `apps/web/src/index.html`, `landing.css`, `landing.js`; `node apps/web/build.mjs` builds it | No test covers the page copy. Live state REPORTED (handoff) |
| K2 | Privacy and imprint pages | P1 | committed | `apps/web/src/privacy.html`, `imprint.html` | Present; content not reviewed in this run |

## Release

| ID | Feature (spec source) | Priority | Status | Evidence | Note |
|---|---|---|---|---|---|
| X1 | Release pipeline: tag builds a DMG and checksums; signs when secrets exist (#20) | P1 | committed | `.github/workflows/release.yml:3-5` (modes: `developer-id`, `self-signed`, ad hoc); decision #23 | Not run in this review. Notarization was dropped by the owner's decision on 2026-11-08, so #20's title is out of date (comment on #20) |

## Totals

Reviewed: 27 items. Verified 16, committed 9, planned 2.

Verified: M1, M2, M3, M5, M6, M7, M8, M9, M10, M13, M14, W2, S1, S2, S3, L1.
Committed: M4, M11, M12, M15, M16, W1, K1, K2, X1.
Planned: W3, L2.

## Differences from the older feature doc

- The habit map is 85 habits, not "about 50" (L1).
- Keep, editor terminals and suggest-keeping (M6 to M8) are in the code; the older doc describes them as spec only and does not record that.
- The guard covers two arrivals, not six chords (M2, decision #39).
- Notarization is not part of the release (X1).
- The Windows and Mac hands-on checks are in the owner's hands (see the plan, Phase 2).

## Open items, with issues

- [#38](https://github.com/soyoxymor0n/cmdnudge/issues/38) Stats: streaks and the misses-per-hour trend (M11)
- [#39](https://github.com/soyoxymor0n/cmdnudge/issues/39) Decision: the guard's scope (M2)
- [#40](https://github.com/soyoxymor0n/cmdnudge/issues/40) Lint script (checks)
- [#41](https://github.com/soyoxymor0n/cmdnudge/issues/41) Menu bar: say when hints pause for a password field (M4)
- [#42](https://github.com/soyoxymor0n/cmdnudge/issues/42) Shared action library with Mac Mouse Fix NG (L2)
- [#43](https://github.com/soyoxymor0n/cmdnudge/issues/43) Optional Windows preview (W3)
- [#44](https://github.com/soyoxymor0n/cmdnudge/issues/44) Hold ⌘ overlay (proposal, not in the spec)
- [#20](https://github.com/soyoxymor0n/cmdnudge/issues/20) Release: scope corrected (X1)
- [#17](https://github.com/soyoxymor0n/cmdnudge/issues/17) and [#34](https://github.com/soyoxymor0n/cmdnudge/issues/34): Windows recorder on hardware (W1)
- [#37](https://github.com/soyoxymor0n/cmdnudge/issues/37): feature-drift check looks in the wrong folder (comment added)
