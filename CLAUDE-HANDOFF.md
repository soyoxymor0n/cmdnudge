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
| hosted sync (account) | #18, all code done; live on previews (dev Clerk), production waits for DNS + a Clerk production instance (Next 4). Web: `api/sync.mjs` + `api/link.mjs` (503 until env is set) → `server/sync.mjs` (validation, device ownership, merge, delete account), `server/link.mjs` (revocable link tokens, SHA-256 stored), `server/turso-http.mjs`, `server/clerk-token.mjs`; sign-in page `src/connect.html`. App: Settings → "Sync with an account" (disabled until the server answers), `hosted.rs` (state-checked `cmdnudge://link` deep link), `sync::hosted_sync`. Verified with the installed app against a local server built from the real handlers. Contract: `docs/setup/03-architecture.md`. |
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

1. Owner answers #21, #23–#25 (mail for hello@cmdnudge.com, Apple Developer account, screen-share
   auto-pause, Windows signing). #22 is answered, see 4.
2. Check #19 on real menus (Open-3), then make it default-on if it behaves.
3. #20 finishes with the first notarized tag after #23. #17: run `npm run tauri dev` in
   `apps/desktop` on a Windows machine, point Settings → Your other computers at a OneDrive/Dropbox
   folder shared with the Mac, press Ctrl+C a few times, sync both; the Mac's raw rows show
   `win_use`.
4. Hosting (#22 answered A, 2026-11-07). Done: Vercel project `cmdnudge` (team soyoxymor0ns-projects,
   root `apps/web`, functions in dub1), domains cmdnudge.com + www (301 to apex) attached; Turso
   `cmdnudge-db` (production) and `cmdnudge-db-beta` (preview + development), aws-eu-west-1; Clerk app
   `cmdnudge` (app_3LlTDj5092zgi3TZx7vGUvo3UtX), development instance only, email sign-in (Google
   switched off); env set per scope: production has the Turso pair only, preview/development have
   Turso beta + `CLERK_PUBLISHABLE_KEY` + `CLERK_JWT_KEY`. Values mirrored in
   `website-assets/.scaffold-secrets` as `*_CMDNUDGE[_PROD]`. Preview verified: `/api/link` answers 200
   with the publishable key, so the store initialised against Turso.
   Not done, and why:
   - DNS: the domain sits on Spaceship nameservers; the owner sets the records listed on #22.
     After that: alias `beta.cmdnudge.com` to the latest preview (`cert_missing` until DNS resolves).
   - No git link: GitHub has no `main` yet, and Vercel takes the production branch from the repo
     default at connect time (`beta`), so linking now would make every beta push production. Once
     `main` exists: set the GitHub default to `main`, `vercel git connect`, set it back to `beta`, add
     `beta.cmdnudge.com` with gitBranch beta. Until then deploy previews from a `git archive HEAD`
     copy with `vercel deploy --target=preview` (a plain first `vercel deploy` went to production).
   - Production sync stays 503 until a Clerk production instance exists (needs its own DNS records
     on cmdnudge.com); then set `CLERK_PUBLISHABLE_KEY` + `CLERK_JWT_KEY` for production
     (`blueprint/tools/clerk-jwt-key.mjs`) and finish the privacy page: its "Accounts and sign-in"
     section names no providers or processors yet - add email sign-in via Clerk, Clerk and Turso
     (what each sees, region), and drop "There is no account" from the short version.
