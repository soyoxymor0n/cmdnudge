# cmdnudge

Your Windows shortcuts, translated the moment you press them.

cmdnudge is a small menu bar app for people whose hands learned Windows. When an old
shortcut slips (Ctrl+C, Win+Shift+S, Alt+F4, AltGr+Q for @), it shows the Mac shortcut in
the corner, right then, without taking focus. Mastered habits go quiet. It never records
what you type: [`filter.rs`](apps/desktop/src-tauri/src/filter.rs) drops everything that is
not a key combination before anything else sees it.

Website: [cmdnudge.com](https://cmdnudge.com)

## What it does

- **Hints** for 85 Windows habits, worked out per layout (US, German, Austrian) and keyboard
  (Apple or PC), for any app plus Finder, browsers, chat, office apps and code editors.
- **The ⌘Q guard**: on German and Austrian Apple keyboards, AltGr+Q (@ on Windows) arrives
  as right ⌘Q and quits the app. cmdnudge stops right ⌘Q and tells you ⌥L. Left ⌘Q still quits.
- **Modes**: show a hint (default), translate (presses the Mac shortcut for you), strict
  (holds the Windows shortcut back until you use the Mac one).
- **Your habits**: what still costs you, 14 days of slips, what you have mastered.
- Stays quiet in remote desktop apps and VMs; no shortcut hints in terminals.
- Local only: counters per habit and app family in a SQLite file on your Mac. Raw rows,
  export and delete are in settings.

## Install

There is no notarized download yet. Building takes a few minutes:

1. Xcode command line tools (`xcode-select --install`), Node 20+ and Rust
   (`curl https://sh.rustup.rs -sSf | sh`).
2. Build and install:
   ```sh
   git clone https://github.com/soyoxymor0n/cmdnudge.git
   cd cmdnudge/apps/desktop
   npm install
   npm run install:local
   ```
   This builds a release, signs it with your Apple Development identity if you have one
   (ad-hoc otherwise) and copies it to `/Applications/cmdnudge.app`.
3. cmdnudge opens its setup window: allow **Input Monitoring** (to notice key combinations)
   and **Accessibility** (for the guard and translate mode), pick your keyboard, press Ctrl+C.

With an ad-hoc signature macOS forgets the two permissions after every rebuild; with a
signing identity it keeps them.

## Repository

| Path | What |
|---|---|
| `packages/library` | The habit map: `src/habits.json` (authored), `tools/generate.mjs` → `dist/library.json` (every habit × layout × keyboard), checker and tests |
| `apps/desktop` | The Tauri 2 app: Rust event tap, matcher, store, native toast (`src-tauri/`), React screens (`src/`) |
| `apps/web` | cmdnudge.com: static page, `build.mjs` copies in the real library and the real `filter.rs` |
| `docs/setup` | The project definition set |

```sh
npm test                                   # library tests + checker
cd apps/desktop/src-tauri && cargo test    # Rust tests, incl. the privacy test
cd apps/web && npm run build               # the website into apps/web/dist
```

## Credits

The keyboard layout measurements (US, German, Austrian) come from
[Mac Mouse Fix NG](https://github.com/soyoxymor0n/mac-mouse-fix-ng)'s shortcut research.

MIT licence. Not affiliated with Apple or Microsoft.
