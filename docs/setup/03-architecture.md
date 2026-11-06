# 03 — Architecture

> Slot 03 of the definition set for **cmdnudge**. Features it serves: [`02-features.md`](02-features.md). Capture and privacy detail: [`09-input-capture-and-privacy.md`](09-input-capture-and-privacy.md). Data: [`08-shortcut-library-and-habit-map.md`](08-shortcut-library-and-habit-map.md).
> Standard: blueprint `docs/standards/project-docs-instruction.md`.

## Shape

One public repository, `cmdnudge`, MIT-licensed (D14):

```
apps/desktop    Tauri 2 app: Rust core + React UI (stats, settings, onboarding)
  src-tauri/    capture (mac/, windows/), matcher, guard, store, sync client
apps/web        house stack: landing page + sync API (Vercel)
packages/library  shortcut data (JSON), schema, checker, generator outputs
```

The house stack (Vite + Express + React + Turso + Clerk on Vercel) is the default and applies **unchanged to `apps/web`**. The desktop app is the deviation.

## Deviations from the house stack

- **Δ1 — Desktop app on Tauri 2 (Rust + React), not a web app.** A background key-combo listener needs native APIs on both systems. Tauri gives one codebase, a small binary, a tray/menu bar app, and lets the UI reuse React and the house UI packages. Alternative considered: a native Swift Mac app plus a separate .NET Windows tray app (best macOS fit, two codebases). Decision D1, confirm. Cost to reverse: high after the capture layer exists.
- **Δ2 — Local SQLite on each device, not Turso as the primary store.** The app must work offline and without an account. Turso holds only synced counters (Δ4).
- **Δ3 — Clerk sign-in from a desktop app.** Clerk has no first-class Tauri SDK. Sign-in opens the system browser on `cmdnudge.com/connect`, which returns a short-lived code to the app through a deep link (`cmdnudge://`) or a localhost loopback. The app exchanges the code for a device token and keeps it in Keychain / Windows Credential Manager. Decision D4; **Open-4** checks Clerk's current support before building.
- **Δ4 — Sync = per-device counters, merged by sum.** Every device owns its rows and only ever writes its own; totals are the sum across devices. No conflicts, no CRDT library, same model for hosted and file sync. Decision D3.
- **Δ5 — No app telemetry.** House logging standards apply to `apps/web` only; the desktop app logs locally to a rotating file the user can read ([`06-metrics-and-analytics.md`](06-metrics-and-analytics.md)).

## Components

| Component | Mac | Windows |
|---|---|---|
| Key capture | `CGEventTap` on key-down. Listen-only needs Input Monitoring; blocking (guard, strict) needs an active tap with Accessibility | `WH_KEYBOARD_LL` low-level hook |
| Frontmost app | `NSWorkspace.frontmostApplication` (bundle ID) | `GetForegroundWindow` → process image name |
| Layout / keyboard | TIS input source ID; keyboard type via `KBGetLayoutType`/HID vendor (Apple vs PC keyboard), user can override | `GetKeyboardLayout` of the foreground thread |
| Menu reading | Accessibility: `AXMenuBar` of the frontmost app, `AXMenuItemCmdChar`/`CmdModifiers` | n/a |
| Menu-by-mouse | AX observer on menu notifications (prototype, **Open-3**) | n/a |
| Toast | non-activating `NSPanel`, all spaces, ignores mouse | topmost layered window, `WS_EX_NOACTIVATE` |
| Store | SQLite (rusqlite) in Application Support | SQLite in `%LOCALAPPDATA%` |

The Rust core owns the matcher, guard, counters and sync. Platform modules only translate OS events into one `Chord { mods, key_code, layout, keyboard_type, app_family }` struct, then **drop the event** (invariant 1 in [`01-project-description.md`](01-project-description.md)).

## Data model

Shortcut data (bundled, read-only, from `packages/library`; full schema in [`08-shortcut-library-and-habit-map.md`](08-shortcut-library-and-habit-map.md)):

- `action` — id (`browser.tab.reopen`), label, category, destructive flag
- `app_family` — id (`chrome`, `files`), Mac bundle IDs, Windows exe names
- `binding` — action × app family (or `system`) × platform × chord × layout variant, source URL, verified on
- `habit_rule` — Windows chord as it physically arrives on the Mac (per layout × keyboard type) → action, guard yes/no

Local state (SQLite):

- `counter` — device_id, platform, app_family, action_id, kind (`habit_miss` | `mac_correct` | `menu_by_mouse` | `win_use`), count, first_seen_day, last_seen_day
- `progress` — action_id, app_family, streak, last_miss_day, mastered_on (derived, recomputed from counters)
- `daily` — day, app_family, kind, count — **local only, never synced** (D9)
- `settings` — mode, guard on/off, paused_until, keyboard type override, sync method

What syncs: `counter` rows of this device and `progress` (invariant 5). Days, not timestamps. No window titles, no chords outside the library, no text.

## Sync

- **Hosted:** `POST /api/sync` on `apps/web` with the device token; body = this device's counter rows; response = all devices' rows for the user. Storage: one Turso database, table `sync_counter(user_id, device_id, platform, app_family, action_id, kind, count, first_seen_day, last_seen_day)`. Free tier fits easily ([`06-metrics-and-analytics.md`](06-metrics-and-analytics.md) has the volume estimate). Delete account = delete all rows, one call.
- **File sync:** folder `cmdnudge-sync/` in a user-chosen shared folder; each device writes `<device_id>.json` atomically (write temp, rename) and reads the others. Same row format as the API.

## Relationships that must not be simplified away

- **Action ≠ chord.** Collapsing "Copy" into "Ctrl+C" breaks every per-app and per-layout case.
- **App family ≠ executable.** `chrome.exe` and `com.google.Chrome` must meet in one family, or Windows ranking never reaches the Mac coach.
- **Habit rule depends on layout × keyboard type.** The AltGr→right-Cmd trap exists only on an Apple keyboard with DE/AT layout. A PC keyboard on a Mac sends right Alt as Option instead.
- **Per-device counters.** Merging totals instead of per-device rows double-counts on every sync.

## Infrastructure to provision (input for the `new-project` + `scaffold` skills)

| Piece | What | Notes |
|---|---|---|
| GitHub | public repo `cmdnudge` (owner: Open-2), MIT, branches `main` + `beta` | release builds from public CI (D15) |
| Vercel | project for `apps/web`, domain cmdnudge.com (Spaceship DNS) | Hobby account, beta → preview → promote (`vercel-deploy-flow`) |
| Turso | `cmdnudge` (prod) + `cmdnudge-preview` | `env-isolation`: previews never touch prod sync rows |
| Clerk | one application, email + Google sign-in, dev + prod instances | desktop sign-in via `cmdnudge.com/connect` (D4, Open-4) |
| Resend | not needed in v1 | Clerk sends its own auth mail |
| R2 / QStash / Redis | not needed | no uploads, no background jobs |
| Apple | Developer ID signing + notarization | Open-9 |
| Windows | code signing | Open-5 |

Generate with `create-app.mjs --slug cmdnudge --reuse --brief docs/setup/cmdnudge-brief.md`. The template lands at the repo root (it keeps `docs/`); whether it is moved to `apps/web` or stays at the root with `apps/desktop` and `packages/library` beside it is settled at scaffold time against D2, without breaking the blueprint sync tooling.

## Security

- `apps/web` follows `authorization-discipline`: `/api/sync` only ever reads and writes rows of the token's user; negative test with another user's device id.
- The desktop app needs no inbound network and only calls `cmdnudge.com/api/*`.
- Code signing: Developer ID + notarization on the Mac; Windows signing **Open-5**.
