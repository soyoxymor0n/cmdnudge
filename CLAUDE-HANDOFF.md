# cmdnudge — handoff (2026-11-06, night build)

State: Mac P0 + most of P1 built, installed and committed on `beta`; landing page built; pushed to
`origin` (soyoxymor0n/cmdnudge) at the end of the night build. Feature status lives in the GitHub
issues (`built` label = committed). Decisions waiting on the owner: issues labelled `owner-action`
(#21–#25).

## What exists

| Path | What |
|---|---|
| `apps/desktop` | Tauri 2 menu bar app (Rust + React). CGEventTap → privacy filter (`src-tauri/src/filter.rs`) → matcher → non-activating NSPanel toast + SQLite counters. Screens: onboarding, habits, habit map, settings. |
| `packages/library` | Habit map: 85 habits + synthesized AltGr typing habits, 2721 rules, 18 layouts (+ `other`) × Apple/PC keyboards (#33). Layouts in `src/layouts.json`; Mac data measured with `tools/dump-mac-layouts.swift`, Windows AltGr layers imported with `tools/import-klc.mjs` (needs the .klc files from kbdlayout.info, not committed). `npm run library` generates `dist/library.json` (compact); `npm run library:check` validates. |
| `apps/desktop` sync | #16: export/import + file sync (`src-tauri/src/sync.rs`). One `<device>.json` per computer in `<folder>/cmdnudge-sync/`, rows summed per device (D3), every file validated against the library. Settings → "Your other computers". |
| `apps/desktop` menu tips | #19, on by default since 2026-11-07 (owner, Open-3) (`menu_tips.rs`, `mac/menus.rs`): AX observer, tip on the third mouse pick of a menu item with a shortcut. Seen working on macOS 26 (2026-11-07): Finder → Go → Home picked three times with the mouse shows "Tip ⇧⌘H · Home"; picking with Return does not count. macOS 26 posts AXSelectedChildrenChanged instead of AXMenuItemSelected and registers the click's mouse-up after AXMenuClosed, so the verdict waits up to 2 s (`menu_tips::judge`). Tested with synthesized clicks; one real-mouse try is still worth doing. `CMDNUDGE_DEBUG=1` logs every step to stderr. |
| `apps/desktop` Windows recorder | #17: `win_recorder.rs` (platform-free: virtual key → chord, exe → family, chord → library action) and `win/mod.rs` (cfg(windows): `WH_KEYBOARD_LL` hook, counts `win_use`, no toast). Counts reach the Mac through file sync; the Mac's "Still costing you" list then orders by Windows usage. Compiles for `x86_64-pc-windows-msvc` (checked locally in isolation) and the CI `windows` job builds and tests the whole app on Windows. **Never run on a real Windows machine yet**, and there is no Windows installer (#25 signing). |
| hosted sync (account) | #18, all code done and configured for every environment; live on cmdnudge.com; one real sign-up from the app still to do (Next 4). Web: `api/sync.mjs` + `api/link.mjs` (503 until env is set) → `server/sync.mjs` (validation, device ownership, merge, delete account), `server/link.mjs` (revocable link tokens, SHA-256 stored), `server/turso-http.mjs`, `server/clerk-token.mjs`; sign-in page `src/connect.html`. App: Settings → "Sync with an account" (disabled until the server answers), `hosted.rs` (state-checked `cmdnudge://link` deep link), `sync::hosted_sync`. Verified with the installed app against a local server built from the real handlers. Contract: `docs/setup/03-architecture.md`. |
| `.github/workflows` | `ci.yml` (tests on every push) and `release.yml` (#20: tag `v*` → universal DMG + SHA256SUMS → draft release; signs + notarizes once the Apple secrets from #23 exist). Universal build verified locally. |
| `apps/web` | cmdnudge.com: static, zero-dependency. `node build.mjs` → `dist/`. Uses the real library.json + chord.mjs; pastes `is_key_combo` from filter.rs into the privacy section. Privacy + imprint pages. |

## Brand colours (#27, #28)

Lime ⌘ = the Mac answer, purple fingertip = the Windows habit. Tokens live once per surface:
`apps/web/src/landing.css` and `apps/desktop/src/app.css` (`--primary`, `--primary-ink`, `--secondary`,
`--secondary-ink`, `--on-primary`; web also `--primary-2`/`--secondary-2`). Older names (`--mac`, `--hand`,
`--accent`, `--cool`) only alias them; use the new ones. The Windows laptop in the duo keeps its own blue.
The native toast (`mac/toast.rs`) uses macOS system colours on purpose.

## How to build and check

- Tests: `npm test` (library), `cd apps/desktop/src-tauri && cargo test` (46 Rust tests: filter, matcher, engine, store, sync, menu tips, Windows recorder).
- App: `cd apps/desktop && npm run install:local` — builds, signs locally without a provisioning
  profile, stops the running copy, installs to `/Applications/cmdnudge.app`. Grant Input Monitoring +
  Accessibility on first run. `CMDNUDGE_DEMO=hint|guard` shows a demo toast 800 ms after launch.
- Web: `cd apps/web && node build.mjs && npx serve dist` (or `npm run dev`).

## Decisions taken tonight (not in docs/setup)

- Open-2: repo lives on the owner's account, `soyoxymor0n/cmdnudge` (public).
- Open-8: owner's hardware measured as **Apple keyboard + Austrian layout**; the right-⌘Q guard
  (AltGr+Q habit) is on for German QWERTZ Apple keyboards (Austrian = `de` since #33; a saved
  setting "at" is read as "de"). Czech/Hungarian AltGr+Q/W are guarded too.
- #33: the app reads the active layout's keycaps with UCKeyTranslate (`mac/keycaps.rs`, ISO 10/50
  swap verified on the owner's Austrian ISO keyboard: matches the static table). Unknown layouts
  are `other`: shortcuts work, no typing habits, Settings links to the layout issue template.
- The landing page is a static site in `apps/web`, not the house React template: it has no
  backend, and a zero-dependency page loads instantly and can run the real library in the browser.
- Landing copy makes no promises about future releases (public-feature-copy).

## Next

0. Hand-test on the installed app (2026-11-08): Keep (#29: hover a hint, Keep in app / everywhere,
   undo in Settings), the VS Code terminal check (#30: Ctrl+C in the integrated terminal stays quiet),
   and the layout select (#33). Windows recorder for the new layouts: #34. Suggest keeping: #31.
1. Owner steps left (all answered 2026-11-07): #21 in Spaceship → Email forwarding, click "Verify DNS changes"
   (the MX/SPF records now live in Vercel DNS) and keep the forward hello@ → priccogente+cmdnudge@gmail.com; #23 decided 2026-11-08: no paid Apple program; releases are signed with a
   self-made certificate (release.yml `self-signed` mode, details on #23), not notarized. #24 built (quiet while
   sharing), #25 decided unsigned (the release workflow builds an unsigned Windows installer).
2. #19 is default-on (Open-3 decided 2026-11-07). Existing installs keep their saved setting. One real-mouse try is still worth doing.
3. #20 finishes with the first notarized tag after #23. #17: run `npm run tauri dev` in
   `apps/desktop` on a Windows machine, point Settings → Your other computers at a OneDrive/Dropbox
   folder shared with the Mac, press Ctrl+C a few times, sync both; the Mac's raw rows show
   `win_use`.
4. Hosting (#22 answered A, DNS + Clerk production approved 2026-11-07). Done: Vercel project `cmdnudge`
   (team soyoxymor0ns-projects, root `apps/web`, functions dub1); DNS on Vercel since 2026-11-07 (Spaceship
   nameservers → ns1/ns2.vercel-dns.com, house pattern; apex/www/beta served by Vercel as project
   domains; records: five Clerk CNAMEs, MX mx1/mx2.efwd.spaceship.net + SPF TXT for Spaceship mail
   forwarding, which needs no env vars); www 301 to apex; `beta.cmdnudge.com`
   aliased to the latest preview (behind Vercel login). Turso `cmdnudge-db` (production) and
   `cmdnudge-db-beta` (preview + development), aws-eu-west-1. Clerk app `cmdnudge`
   (app_3LlTDj5092zgi3TZx7vGUvo3UtX): dev instance + production instance on cmdnudge.com, email code or
   password, Google off. Env complete for every scope (Turso pair, `CLERK_PUBLISHABLE_KEY`,
   `CLERK_JWT_KEY`); values mirrored in `website-assets/.scaffold-secrets` as `*_CMDNUDGE[_PROD]`.
   Privacy page names Clerk, Turso and email sign-in.
   Live since 2026-11-07 (owner said go live): `main` created from beta, Vercel git-linked with
   production branch `main` (GitHub default was main during `vercel git connect`, then set back to
   beta), `beta.cmdnudge.com` bound to gitBranch beta. Pushes to main deploy production, pushes to
   beta deploy previews. Verified on cmdnudge.com: landing 200, www 301 to apex, /privacy 200,
   /api/link answers with pk_live, /api/sync without a key 401, Clerk domain status complete.
   Still open:
   - Sign up once on cmdnudge.com/connect from the app to confirm
     production sync end to end.
