//! Hold Command to see this app's Mac shortcuts (#44). Off by default; the setting turns it on.
//!
//! Platform-free: the hold state machine (when a held Command shows the overlay and when it goes
//! away) and the rows (the Mac chords of the frontmost app family, from the library). The window
//! and the event tap live in lib.rs and mac/tap.rs.

use crate::chord::format_mac;
use crate::library::Library;
use serde::Serialize;
use std::collections::HashSet;

/// How long Command must be held alone before the overlay shows. Shorter taps are keyboard habits
/// (Command+C and the like), not a request to see the shortcuts.
pub const HOLD_MS: i64 = 350;
/// The most rows the overlay shows; the rest are one search away in the habit map.
pub const MAX_ROWS: usize = 16;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Step {
    Nothing,
    Show,
    Hide,
}

/// Where a hold of Command stands. Any other key or modifier while Command is held "spoils" it:
/// the user is typing a shortcut, not asking for the overlay.
#[derive(Default, Debug)]
pub struct Hold {
    since: Option<i64>,
    spoiled: bool,
    shown: bool,
}

impl Hold {
    /// A modifier changed. `cmd` is Command held now; `others` is Control, Option or Shift held now.
    pub fn flags(&mut self, cmd: bool, others: bool, now: i64) -> Step {
        if cmd && !others {
            if self.since.is_none() && !self.spoiled && !self.shown {
                self.since = Some(now);
            }
            return Step::Nothing;
        }
        // Command let go, or another modifier joined it: the hold is over.
        let was_shown = self.shown;
        *self = Hold { spoiled: cmd, ..Hold::default() };
        if was_shown { Step::Hide } else { Step::Nothing }
    }

    /// A key went down. Only a key pressed while Command is held spoils the hold.
    pub fn key(&mut self, cmd: bool) -> Step {
        if !cmd {
            return Step::Nothing;
        }
        let was_shown = self.shown;
        *self = Hold { spoiled: true, ..Hold::default() };
        if was_shown { Step::Hide } else { Step::Nothing }
    }

    /// Called on a timer. Shows the overlay once Command has been held long enough and nothing spoiled it.
    pub fn tick(&mut self, now: i64) -> Step {
        match self.since {
            Some(t) if !self.spoiled && !self.shown && now - t >= HOLD_MS => {
                self.shown = true;
                Step::Show
            }
            _ => Step::Nothing,
        }
    }
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Row {
    pub label: String,
    pub chord: String,
    pub category: String,
}

/// The Mac shortcuts for an app family: its own first, then the universal ones (the library's
/// Mac ways). Sorted by category, then label, and capped at `MAX_ROWS`.
pub fn rows(lib: &Library, family: &str) -> Vec<Row> {
    let mut seen = HashSet::new();
    let mut out: Vec<Row> = Vec::new();
    let ways = lib.mac_ways.iter().filter(|w| w.family == family)
        .chain(lib.mac_ways.iter().filter(|w| w.family == "system"));
    for w in ways {
        if !seen.insert(w.action.clone()) {
            continue;
        }
        let Some(a) = lib.action(&w.action) else { continue };
        out.push(Row { label: a.label.clone(), chord: format_mac(&w.chord), category: a.category.clone() });
    }
    out.sort_by(|a, b| a.category.cmp(&b.category).then(a.label.cmp(&b.label)));
    out.truncate(MAX_ROWS);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_held_command_shows_the_overlay_after_the_delay() {
        let mut h = Hold::default();
        assert_eq!(h.flags(true, false, 0), Step::Nothing);
        assert_eq!(h.tick(HOLD_MS - 1), Step::Nothing);
        assert_eq!(h.tick(HOLD_MS), Step::Show);
        assert_eq!(h.tick(HOLD_MS + 500), Step::Nothing, "shows once");
        assert_eq!(h.flags(false, false, 900), Step::Hide);
    }

    #[test]
    fn a_quick_tap_of_command_shows_nothing() {
        let mut h = Hold::default();
        h.flags(true, false, 0);
        assert_eq!(h.flags(false, false, 100), Step::Nothing);
        assert_eq!(h.tick(1_000), Step::Nothing);
    }

    #[test]
    fn a_key_pressed_with_command_spoils_the_hold() {
        let mut h = Hold::default();
        h.flags(true, false, 0);
        assert_eq!(h.key(true), Step::Nothing, "Command+C is a shortcut, not a request");
        assert_eq!(h.tick(1_000), Step::Nothing);
    }

    #[test]
    fn typing_without_command_does_not_spoil_a_later_hold() {
        let mut h = Hold::default();
        assert_eq!(h.key(false), Step::Nothing);
        h.flags(true, false, 0);
        assert_eq!(h.tick(HOLD_MS), Step::Show);
    }

    #[test]
    fn another_modifier_hides_and_spoils_until_command_is_released() {
        let mut h = Hold::default();
        h.flags(true, false, 0);
        assert_eq!(h.tick(HOLD_MS), Step::Show);
        assert_eq!(h.flags(true, true, 500), Step::Hide, "Command+Shift is a chord");
        assert_eq!(h.flags(true, false, 600), Step::Nothing, "Shift let go, Command still held");
        assert_eq!(h.tick(2_000), Step::Nothing, "still spoiled");
        assert_eq!(h.flags(false, false, 2_100), Step::Nothing);
        h.flags(true, false, 3_000);
        assert_eq!(h.tick(3_000 + HOLD_MS), Step::Show, "a new hold works");
    }

    #[test]
    fn a_key_while_shown_hides_the_overlay() {
        let mut h = Hold::default();
        h.flags(true, false, 0);
        h.tick(HOLD_MS);
        assert_eq!(h.key(true), Step::Hide);
    }

    fn fixture() -> Library {
        Library::parse(
            r#"{
              "layoutInfo": [],
              "actions": [
                {"id": "edit.copy", "label": "Copy", "category": "edit", "destructive": false},
                {"id": "tab.close", "label": "Close tab", "category": "window", "destructive": false},
                {"id": "fx.only-elsewhere", "label": "Elsewhere", "category": "edit", "destructive": false}
              ],
              "appFamilies": [
                {"id": "system", "label": "Any app", "mac": []},
                {"id": "browser", "label": "Browser", "mac": ["com.google.Chrome"]},
                {"id": "terminal", "label": "Terminal", "mac": ["com.apple.Terminal"], "exclude": "hints"}
              ],
              "habitRules": [],
              "macWays": [
                {"action": "edit.copy", "family": "system", "chord": "cmd+c", "layouts": ["us"]},
                {"action": "tab.close", "family": "browser", "chord": "cmd+w", "layouts": ["us"]},
                {"action": "fx.only-elsewhere", "family": "terminal", "chord": "cmd+k", "layouts": ["us"]}
              ]
            }"#,
        )
    }

    #[test]
    fn the_overlay_lists_the_frontmost_family_then_the_universal_ones() {
        let lib = fixture();
        let rows = rows(&lib, "browser");
        let labels: Vec<(&str, &str)> = rows.iter().map(|r| (r.label.as_str(), r.chord.as_str())).collect();
        // Sorted by category (edit before window), then label.
        assert_eq!(labels, vec![("Copy", "⌘C"), ("Close tab", "⌘W")]);
    }

    #[test]
    fn another_family_gets_only_its_own_and_the_universal_rows() {
        let lib = fixture();
        let rows = rows(&lib, "terminal");
        assert!(rows.iter().any(|r| r.label == "Elsewhere" && r.chord == "⌘K"));
        assert!(rows.iter().all(|r| r.label != "Close tab"), "browser rows never leak into the terminal");
    }

    #[test]
    fn rows_are_capped() {
        let mut lib = fixture();
        for i in 0..(MAX_ROWS + 5) {
            lib.actions.push(crate::library::Action {
                id: format!("x.{i}"), label: format!("Action {i}"), category: "misc".into(), destructive: false,
            });
            lib.mac_ways.push(crate::library::MacWay {
                action: format!("x.{i}"), family: "system".into(), chord: "cmd+j".into(), layouts: vec![], pattern: None,
            });
        }
        assert_eq!(rows(&lib, "system").len(), MAX_ROWS);
    }

    mod gate {
        use crate::engine::{now, Engine};
        use crate::store::Store;

        fn engine() -> &'static Engine {
            Box::leak(Box::new(Engine::new(Store::in_memory().unwrap())))
        }

        fn on(e: &Engine) {
            e.settings.write().unwrap().overlay = true;
        }

        #[test]
        fn off_by_default_so_nothing_shows() {
            assert!(!engine().overlay_allowed("com.google.Chrome", false, false));
        }

        #[test]
        fn on_shows_for_an_ordinary_app() {
            let e = engine();
            on(e);
            assert!(e.overlay_allowed("com.google.Chrome", false, false));
        }

        #[test]
        fn never_in_terminals_or_remote_desktops() {
            let e = engine();
            on(e);
            assert!(!e.overlay_allowed("com.apple.Terminal", false, false));
            assert!(!e.overlay_allowed("com.microsoft.rdc.macos", false, false));
        }

        #[test]
        fn not_in_a_password_field_and_not_while_the_screen_is_shared() {
            let e = engine();
            on(e);
            assert!(!e.overlay_allowed("com.google.Chrome", false, true), "secure input");
            assert!(!e.overlay_allowed("com.google.Chrome", true, false), "quiet while sharing is on by default");
        }

        #[test]
        fn muted_or_paused_means_no_overlay() {
            let e = engine();
            on(e);
            e.settings.write().unwrap().muted_families.push("browser".into());
            assert!(!e.overlay_allowed("com.google.Chrome", false, false));
            let e = engine();
            on(e);
            e.settings.write().unwrap().paused_until = Some(now() + 3600);
            assert!(!e.overlay_allowed("com.google.Chrome", false, false));
        }
    }
}
