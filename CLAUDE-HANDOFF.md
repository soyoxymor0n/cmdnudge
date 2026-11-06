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
| `apps/desktop` Windows recorder | #17: `win_recorder.rs` (platform-free: virtual key → chord, exe → family, chord → library action) and `win/mod.rs` (cfg(windows): `WH_KEYBOARD_LL` hook, counts `win_use`, no toast). Counts reach the Mac through file sync; the Mac's "Still costing you" list then orders by Windows usage. Compiles for `x86_64-pc-windows-msvc` (checked locally in isolation) and the CI `windows` job builds and tests the whole app on Windows. **Never run on a real Windows machine yet**, and there is no Windows installer (#25 signing). |
| `apps/web/api` + `server` hosted sync | #18: `api/sync.mjs` (POST/DELETE, 503 until env is set) → `server/sync.mjs` (validation, per-account device ownership, merge, delete account) on `server/turso-http.mjs` (Turso HTTP, no deps) with `server/clerk-token.mjs` (offline RS256 check of Clerk session tokens). Tested on node:sqlite through a Hrana stand-in, incl. cross-account and forged-token negative tests. App side: `sync::hosted_sync` (HTTP call) + `sync::apply_hosted`. **Not live**: no Vercel project, Turso DB, Clerk instance, sign-in flow or Settings UI yet. Contract: `docs/setup/03-architecture.md`. |
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
3. #20 finishes with the first notarized tag after #23. #17: run `npm run tauri dev` in
   `apps/desktop` on a Windows machine, point Settings → Your other computers at a OneDrive/Dropbox
   folder shared with the Mac, press Ctrl+C a few times, sync both; the Mac's raw rows show
   `win_use`. #18: after #22 and Open-4, create Turso `cmdnudge` + `cmdnudge-preview` and a Clerk
   instance, set `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `CLERK_JWT_KEY` per Vercel environment,
   then build the sign-in hand-off (system browser → deep link with the session token) and the
   Settings switch that calls `sync::hosted_sync`.
