# cmdnudge: next-level plan (from the 2026-11-16 review)

> Companion to [`docs/research/cmdnudge-next-level-2026-11-16.md`](research/cmdnudge-next-level-2026-11-16.md) and
> [`docs/cmdnudge-features.md`](cmdnudge-features.md). Each item links to its issue. Estimates are ESTIMATE
> labels: solo owner working with Claude, in person-days, not sourced.

## Shape

```
Phase 0  owner decisions ─────────────┬──> Phase 4  extensions (after their gates)
Phase 1  close spec gaps (agent) ─────┤
Phase 2  owner hand tests ────────────┴──> Phase 4 (#43 needs #17 verified)
Phase 3  release path (independent)
```

Phase 1 does not depend on Phase 0. None of its items touches the guard, so the answer to #39 does not change them.

## Phase 0: owner decisions (no code)

| Item | Decision | Issue | Blocks | Default if unanswered |
|---|---|---|---|---|
| D-1 | Guard scope: six chords, or the two arrivals built? | [#39](https://github.com/soyoxymor0n/cmdnudge/issues/39) | Option 2 of the guard only | Build as it is (two arrivals) |
| D-2 | Is cmdnudge a suite module (catalogue entry)? | none filed | Nothing in this plan | Standalone; no catalogue entry |
| D-3 | Feature doc: keep `docs/setup/02-features.md` as the build contract, or retire it for `docs/cmdnudge-features.md`? | none filed | Nothing | Keep both; the new one is the verified state |
| D-4 | Licence of the shared action library (C5) | [#42](https://github.com/soyoxymor0n/cmdnudge/issues/42) | #42 | Not started |
| D-5 | Does a Hold-⌘ overlay fit the product's scope? | [#44](https://github.com/soyoxymor0n/cmdnudge/issues/44) | #44 | Not started |

**Estimate:** under one hour of owner time.

**Gate:** each decision is answered on its issue, or the default is written down there.

## Phase 1: close the spec gaps (agent-doable)

| Item | Issue | Estimate | Depends on | Acceptance |
|---|---|---|---|---|
| 1a | Stats: streaks and misses-per-hour trend ([#38](https://github.com/soyoxymor0n/cmdnudge/issues/38)) | 2–3 days (incl. a store migration if hours are stored) | nothing | Tests named in the issue: streak and gap; per-hour rate under a fixed clock, with no divide by zero. Hand check of the screen |
| 1b | Menu bar line for secure-input pause ([#41](https://github.com/soyoxymor0n/cmdnudge/issues/41)) | half a day | nothing | Status-line test; tap behaviour unchanged |
| 1c | `lint` script at the root ([#40](https://github.com/soyoxymor0n/cmdnudge/issues/40)) | half a day | nothing | Runs in `ci.yml`; a deliberate type error fails it |

**Gate (end of Phase 1):** `npm test`, `npm run lint`, `npm run library:check`, `npm run build` in `apps/desktop`, `cargo test --locked`, and the web build, all green on the branch. Every new behaviour has a test; the negative test for 1c is in. Docs in sync: `docs/cmdnudge-features.md` statuses updated for M4, M11 and M16 where they change.

**Rules.** No product change outside the items above. Each item lands as its own commit with `fixes #N` in the message, on the branch the owner names. Nothing is pushed to `beta` without the owner's word.

## Phase 2: owner hand tests (no code)

The code for these exists and has tests. The rest needs the owner's own machines.

| Item | What to do | Source |
|---|---|---|
| 2a | Keep (#29): hover a hint, Keep in app and Keep everywhere, undo in Settings | handoff, Next 0; `mac/toast.rs:269-271` |
| 2b | Editor terminal (#30): Ctrl+C in the VS Code integrated terminal stays quiet | handoff, Next 0 |
| 2c | Suggest keeping (#31): on a test install, insert an evidence row as the handoff describes, then check the question | handoff, Next 0 |
| 2d | Mouse tip (#19): one real-mouse pick of a menu item three times | handoff, Next 2 |
| 2e | Windows recorder (#17, #34): `npm run tauri dev` on a Windows machine, a shared folder, Ctrl+C a few times, sync both | handoff, Next 3 |
| 2f | Hosted sync (#18): one sign-up from the app at cmdnudge.com/connect | handoff, Next 4 |

**Gate:** the owner comments on each issue with what was seen. Agents do not close issues. Item 2e unlocks #43 in Phase 4.

**Estimate:** about two hours of owner time, plus a Windows machine for 2e.

## Phase 3: release path (independent of Phases 0–2)

| Item | Issue | Estimate | Depends on |
|---|---|---|---|
| 3a | Scope correction on #20 (already commented) | done in this run | nothing |
| 3b | Tagged build in CI in `self-signed` mode, with the DMG and `SHA256SUMS` on a draft release | 1 day | `APPLE_CERTIFICATE` secrets (decision #23) and the owner's go-ahead to tag |
| 3c | Install on a second Mac from the draft, with the "Open Anyway" step written down | half a day | 3b |

**Gate:** the draft release has the DMG and checksums, and the install on a clean Mac works after the documented first-open step. The release is not published without the owner's word.

**Note.** Notarization is not on this path. It needs the paid Apple Developer Program, which the owner declined on 2026-11-08 (#23). It would be a new decision, not a fix.

## Phase 4: extensions (each after its gate)

| Item | Issue | Estimate | Gate before starting | Acceptance |
|---|---|---|---|---|
| 4a | Optional Windows preview ([#43](https://github.com/soyoxymor0n/cmdnudge/issues/43)) | 2 days | Phase 2e: the hook is verified on Windows | Off by default; mapping test (`ctrl+c` to `cmd+c`); no toast while sharing |
| 4b | Shared action library with Mac Mouse Fix NG ([#42](https://github.com/soyoxymor0n/cmdnudge/issues/42)) | 4 days, across two repos | D-4 answered | Versioned package; `library:check` covers its schema; a test in the Mac Mouse Fix repo reads it |
| 4c | Hold-⌘ overlay ([#44](https://github.com/soyoxymor0n/cmdnudge/issues/44)) | 3 days | D-5 answered; Phase 1 gate green | Off by default; lists the frontmost app's Mac chords from the library; no overlay in terminals or remote desktops |

**Gate (each):** the acceptance tests in the issue pass; the docs statuses are updated; the owner has used it by hand once.

## What this plan does not do

- Set or change prices, catalogue status or entitlements. None is proposed.
- Close issues, delete branches, or publish a release without the owner's word.
- Change product code in this run. Phase 1 is the first code, and it waits for the owner's go-ahead to start.

## Dependencies on the owner's own accounts

- Phase 2e needs a Windows machine.
- Phase 3b needs the release secrets to stay in place (decision #23: do not lose or replace the certificate).
- Phase 4b needs the licence answer (C5).
