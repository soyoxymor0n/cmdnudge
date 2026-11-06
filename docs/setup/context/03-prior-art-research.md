# Prior-art research and brainstorm (as delivered, 2026-11-06)

## Brainstorm outcome (before research)

- Reframe: Windows = recorder/profiler (which shortcuts do I use, how often, in which app); macOS = coach (catch Windows-habit chords, show the Mac shortcut for the same action in that app).
- Map by action, not by key: `action × app family × platform × chord × layout`. App families join `chrome.exe` with `com.google.Chrome`, `explorer.exe` with `com.apple.finder`.
- Read the Mac menu bar live through the Accessibility API to get most app shortcuts without curating them; curate system shortcuts, the Windows side and localized titles.
- Stack idea: Tauri (Rust + React), CGEventTap listen-only + NSWorkspace on Mac, WH_KEYBOARD_LL + GetForegroundWindow on Windows, own always-on-top toast window, local SQLite, sync via Turso or export/import.
- Privacy: record only chords with modifiers or function/navigation keys; never plain typing; secure input on Mac; skip elevated/credential windows on Windows; local only, no telemetry.
- Learning modes: translate + toast, toast only, strict.
- Correction found: Win+E maps to Option-Cmd-Space (Finder window), not Cmd+Space (Spotlight).

## Research verdict

No existing product, free or paid, detects a Windows shortcut pressed on a Mac and shows the Mac shortcut for the same action in the frontmost app.

| Project | What it does | Fit |
|---|---|---|
| KeyCat | Background app; corner toast with the keyboard shortcut for a mouse action; habit stats | Closest concept; Ubuntu + Chrome only, 8 stars, abandoned |
| Key Promoter X (JetBrains) | Hint after a mouse click with the shortcut you could have used; "clicks before notification" threshold; missed-shortcuts list; offers to create a binding; snooze | The proven teaching pattern, IDE only |
| KeyCombiner | Public shortcut DB, practice drills with confidence (accuracy + speed), active-app lookup on Win/Mac/Linux | Data + drills; freemium SaaS, data licence unclear, no usage watching |
| Keysi, KeyCue, KeyClu | Read frontmost app menus live via Accessibility, show shortcuts | Proves the live menu-reading approach |
| WhatPulse | Counts key combinations, per-app stats (paid) | Privacy model: counts, not sequences |
| Karabiner Windows configs (m3au/karabiner), pcfy-my-mac | Make the Mac behave like Windows | Opposite of learning; good list of Windows habits |
| Ctrl2Cmd | Paid ($9) Mac app remapping Ctrl to Cmd | Remap approach (anti-persona tool) |
| Mouseless | Mac shortcut drills, 1000+ shortcuts | Archived; code public, paid licence |
| KeyMap, CtrlHelp data, ShortcutMapper | JSON shortcut data per app; KeyMap links official docs + verified badge; CtrlHelp data MIT | Possible seed data; licences to check |
| KeyCastr | Open-source Mac overlay of pressed keys | Reference for the toast window |

## Lessons taken

1. Threshold, don't spam (Key Promoter X): hint after repeats; missed list; snooze for presentations.
2. Teach mouse use too: menu item picked with the mouse -> "you could have pressed Cmd+Shift+T". Reliability of catching menu selections in every app is an assumption to prototype.
3. Count, don't record (WhatPulse).
4. Accuracy + speed confidence (KeyCombiner) for "mastered", drills later.
5. Keep the curated data small: Mouseless, CheatSheet and KeyCat all stopped; maintaining a large hand-kept list is the killer. Read the Mac side live, curate only the Windows<->Mac habit map (hundreds, not thousands).
6. Seed data from Karabiner Windows configs and pcfy-my-mac; KeyMap/CtrlHelp only where the licence allows; MMF NG's verified entries first.
7. Cross-platform from the start (KeyCat died partly for being one setup only).

Sources: github.com/KatreMetsvahi/KeyCat; github.com/halirutan/IntelliJ-Key-Promoter-X; plugins.jetbrains.com/plugin/9792-key-promoter-x; dev.to/tkainrad (KeyCombiner); alternativeto.net (Keysi, KeyCue, CheatSheet, Ctrl2Cmd); whatpulse.org help docs; github.com/raxigan/pcfy-my-mac; awesome.ecosyste.ms entries for m3au/karabiner, Mouseless, KeyMap, ShortcutMapper, CtrlHelp.
