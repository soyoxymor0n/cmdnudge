# cmdnudge — handoff (2026-11-06, night build)

State: Mac P0 + most of P1 built, installed and committed on `beta`; landing page built; pushed to
`origin` (soyoxymor0n/cmdnudge) at the end of the night build. Feature status lives in the GitHub
issues (`built` label = committed). Decisions waiting on the owner: issues labelled `owner-action`
(#21–#25).

## What exists

| Path | What |
|---|---|
| `apps/desktop` | Tauri 2 menu bar app (Rust + React). CGEventTap → privacy filter (`src-tauri/src/filter.rs`) → matcher → non-activating NSPanel toast + SQLite counters. Screens: onboarding, habits, habit map, settings. |
| `packages/library` | Habit map: 85 habits, 412 rules, US/DE/AT × Apple/PC keyboards. `npm run library` generates `dist/library.json`; `npm run library:check` validates. |
| `apps/desktop` sync | #16: export/import + file sync (`src-tauri/src/sync.rs`). One `<device>.json` per computer in `<folder>/cmdnudge-sync/`, rows summed per device (D3), every file validated against the library. Settings → "Your other computers". |
| `apps/desktop` menu tips | #19, experimental, off by default (`menu_tips.rs`, `mac/menus.rs`): AX observer, tip on the third mouse pick of a menu item with a shortcut. Unit-tested and running without errors; **not yet seen working on real menus** (the screen was locked during the night build) — switch it on in Settings → Learning mode and pick e.g. Finder → Go → Home three times. |
| `.github/workflows` | `ci.yml` (tests on every push) and `release.yml` (#20: tag `v*` → universal DMG + SHA256SUMS → draft release; signs + notarizes once the Apple secrets from #23 exist). Universal build verified locally. |
| `apps/web` | cmdnudge.com: static, zero-dependency. `node build.mjs` → `dist/`. Uses the real library.json + chord.mjs; pastes `is_key_combo` from filter.rs into the privacy section. Privacy + imprint pages. |

## How to build and check

- Tests: `npm test` (library), `cd apps/desktop/src-tauri && cargo test` (34 Rust tests: filter, matcher, engine, store, sync, menu tips).
- App: `cd apps/desktop && npm run install:local` — builds, signs locally without a provisioning
  profile, stops the running copy, installs to `/Applications/cmdnudge.app`. Grant Input Monitoring +
  Accessibility on first run. `CMDNUDGE_DEMO=hint|guard` shows a demo toast 800 ms after launch.
- Web: `cd apps/web && node build.mjs && npx serve dist` (or `npm run dev`).

## Decisions taken tonight (not in docs/setup)

- Open-2: repo lives on the owner's account, `soyoxymor0n/cmdnudge` (public).
- Open-8: owner's hardware measured as **Apple keyboard + Austrian layout**; the right-⌘Q guard
  (AltGr+Q habit) is on for DE/AT Apple keyboards.
- The landing page is a static site in `apps/web`, not the house React template: it has no
  backend, and a zero-dependency page loads instantly and can run the real library in the browser.
- Landing copy makes no promises about future releases (public-feature-copy).

## Next

1. Owner answers #21–#25 (mail for hello@cmdnudge.com, Vercel project + domain, Apple Developer
   account, screen-share auto-pause, Windows signing).
2. Check #19 on real menus (Open-3), then make it default-on if it behaves.
3. #20 finishes with the first notarized tag after #23. #17 Windows recorder needs a Windows machine
   to test on (file sync already gives it a way to hand counts to the Mac). #18 hosted sync needs
   Clerk + Turso provisioning and Open-4.
