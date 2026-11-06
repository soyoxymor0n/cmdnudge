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
| `apps/web` | cmdnudge.com: static, zero-dependency. `node build.mjs` → `dist/`. Uses the real library.json + chord.mjs; pastes `is_key_combo` from filter.rs into the privacy section. Privacy + imprint pages. |

## How to build and check

- Tests: `npm test` (library), `cd apps/desktop/src-tauri && cargo test` (26 Rust tests: filter, matcher, engine).
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
2. Then: #20 notarized DMG from public CI, #19 menu-by-mouse hints (prototype Open-3 first),
   #16 export/import, #17 Windows recorder, #18 hosted sync.
