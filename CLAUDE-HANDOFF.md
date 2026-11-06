# cmdnudge — handoff (2026-11-06)

State: definition set done and validated (`docs/setup/`, `node ../blueprint/tools/project-docs.mjs --check .` = OK). Local git only, no remote yet (Open-2). Domain cmdnudge.com registered.

Owner's target: "Everything built tonight, as far as possible. Ready to be used tomorrow on mac".

## Tonight's build = Mac P0 only (docs/setup/02-features.md)

1. Install Rust (`rustup`, stable) - not installed on this Mac yet. Node and Xcode are present.
2. `npm create tauri-app` → `apps/desktop` (Tauri 2, React + TS). Menu bar (tray) app, no dock icon.
3. Rust capture: CGEventTap on key-down (active tap, so the guard can block), filter per `docs/setup/09-input-capture-and-privacy.md` FIRST, with tests.
4. Frontmost app via NSWorkspace; layout via TIS; keyboard type override in settings.
5. Matcher + ~50 habit rules in `packages/library` (JSON, schema in `docs/setup/08-shortcut-library-and-habit-map.md`), incl. the right-⌘Q guard for DE/AT Apple keyboards.
6. Toast: non-activating NSPanel bottom right (`docs/setup/04-design.md`).
7. SQLite counters (`habit_miss`, `mac_correct`), pause menu.
8. Sign locally (as in MMF NG: no provisioning profile), install to /Applications, grant Input Monitoring + Accessibility.

Not tonight: Windows recorder, sync, stats screen, menu-by-mouse, landing page, notarization.

Before step 5, measure the owner's keyboard (Open-8): Apple or PC keyboard, DE or AT layout.
