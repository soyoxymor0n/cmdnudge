//! Windows recorder (#17), platform-free core: which Windows shortcuts the user really presses,
//! counted per app family as `win_use` rows. On the Mac those rows (via file sync) rank the
//! "habits still costing you" list by real Windows usage.
//!
//! Privacy (invariant 1, stricter than the Mac filter): a key press is kept only if it IS one of
//! the library's Windows habit chords. Everything else, typing included, is dropped inside the
//! hook callback. No toast on Windows (D10).

#![cfg_attr(not(windows), allow(dead_code))]

use crate::library::Library;

/// Windows virtual-key codes the library's chords use.
pub mod vk {
    pub const BACK: u32 = 0x08;
    pub const TAB: u32 = 0x09;
    pub const RETURN: u32 = 0x0D;
    pub const ESCAPE: u32 = 0x1B;
    pub const SPACE: u32 = 0x20;
    pub const END: u32 = 0x23;
    pub const HOME: u32 = 0x24;
    pub const LEFT: u32 = 0x25;
    pub const UP: u32 = 0x26;
    pub const RIGHT: u32 = 0x27;
    pub const DOWN: u32 = 0x28;
    pub const DELETE: u32 = 0x2E;
    pub const F1: u32 = 0x70;
    pub const OEM_PLUS: u32 = 0xBB;
    pub const OEM_MINUS: u32 = 0xBD;
    pub const OEM_PERIOD: u32 = 0xBE;
    /// "ß" on German/Austrian layouts.
    pub const OEM_4: u32 = 0xDB;
    /// "<" key next to left Shift on ISO keyboards.
    pub const OEM_102: u32 = 0xE2;
    pub const ADD: u32 = 0x6B;
    pub const SUBTRACT: u32 = 0x6D;
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct WinMods {
    pub ctrl: bool,
    pub shift: bool,
    pub alt: bool,
    pub win: bool,
    /// Right Alt on layouts with AltGr. Windows reports it as left Ctrl + right Alt; the hook
    /// passes `altgr: true, ctrl: false, alt: false` for it.
    pub altgr: bool,
}

/// The library's name for a virtual key, if it is one the library uses.
pub fn key_name(vk_code: u32) -> Option<String> {
    Some(match vk_code {
        0x41..=0x5A => ((vk_code as u8) as char).to_ascii_lowercase().to_string(),
        0x30..=0x39 => ((vk_code as u8) as char).to_string(),
        vk::BACK => "backspace".into(),
        vk::TAB => "tab".into(),
        vk::RETURN => "return".into(),
        vk::ESCAPE => "esc".into(),
        vk::SPACE => "space".into(),
        vk::END => "end".into(),
        vk::HOME => "home".into(),
        vk::LEFT => "left".into(),
        vk::UP => "up".into(),
        vk::RIGHT => "right".into(),
        vk::DOWN => "down".into(),
        vk::DELETE => "fwddelete".into(),
        vk::OEM_PLUS | vk::ADD => "plus".into(),
        vk::OEM_MINUS | vk::SUBTRACT => "minus".into(),
        vk::OEM_PERIOD => "period".into(),
        vk::OEM_4 => "ß".into(),
        vk::OEM_102 => "<".into(),
        f if (vk::F1..vk::F1 + 12).contains(&f) => format!("f{}", f - vk::F1 + 1),
        _ => return None,
    })
}

/// Canonical chord text in the library's `windows` notation: modifiers in a fixed order, then the key.
pub fn chord_text(m: WinMods, key: &str) -> String {
    let mut parts: Vec<&str> = vec![];
    if m.altgr {
        parts.push("altgr");
    }
    if m.ctrl {
        parts.push("ctrl");
    }
    if m.win {
        parts.push("win");
    }
    if m.alt {
        parts.push("alt");
    }
    if m.shift {
        parts.push("shift");
    }
    parts.push(key);
    parts.join("+")
}

/// Brings a library chord ("alt+shift+tab", "win+shift+s") into the same order as `chord_text`.
pub fn normalize(chord: &str) -> String {
    let parts: Vec<&str> = chord.split('+').collect();
    let (mods, key) = parts.split_at(parts.len() - 1);
    let has = |m: &str| mods.contains(&m);
    chord_text(WinMods { ctrl: has("ctrl"), shift: has("shift"), alt: has("alt"), win: has("win"), altgr: has("altgr") }, key[0])
}

pub struct Recorder {
    /// (normalized chord, habit family, action)
    entries: Vec<(String, String, String)>,
    /// (family id, lowercase exe names)
    families: Vec<(String, Vec<String>)>,
}

impl Recorder {
    pub fn new(lib: &Library) -> Recorder {
        Recorder {
            entries: lib.habits.iter().map(|h| (normalize(&h.windows), h.family.clone(), h.action.clone())).collect(),
            families: lib
                .app_families
                .iter()
                .map(|f| (f.id.clone(), f.windows.iter().map(|e| e.to_lowercase()).collect()))
                .collect(),
        }
    }

    /// Cheap first gate for the hook: is this chord any library habit at all? If not, the event
    /// is forgotten before the foreground app is even looked up.
    pub fn is_habit_chord(&self, chord: &str) -> bool {
        self.entries.iter().any(|(c, _, _)| c == chord)
    }

    pub fn family_of_exe(&self, exe: &str) -> &str {
        let exe = exe.to_lowercase();
        self.families.iter().find(|(_, list)| list.contains(&exe)).map(|(id, _)| id.as_str()).unwrap_or("system")
    }

    /// The action this chord means in this app family: a family-specific habit wins over a
    /// system-wide one with the same chord.
    pub fn action_for(&self, chord: &str, family: &str) -> Option<&str> {
        let hit = |f: &str| self.entries.iter().find(|(c, fam, _)| c == chord && fam == f).map(|(_, _, a)| a.as_str());
        hit(family).or_else(|| hit("system"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library;

    fn m(f: impl Fn(&mut WinMods)) -> WinMods {
        let mut x = WinMods::default();
        f(&mut x);
        x
    }

    #[test]
    fn every_library_chord_is_reachable_from_virtual_keys() {
        // If a habit uses a key name key_name() cannot produce, the recorder would never count it.
        let lib = library::get();
        let names: std::collections::HashSet<String> = (0u32..256).filter_map(key_name).collect();
        // The recorder names keys the German/US way; typing habits of the other layouts (#33)
        // need the layout's own key names on Windows first (filed as a todo).
        use crate::keymap::Layout;
        for h in lib.habits.iter().filter(|h| h.layouts.iter().any(|l| matches!(l, Layout::Us | Layout::De))) {
            let key = h.windows.rsplit('+').next().unwrap();
            assert!(names.contains(key), "{}: key {key:?} has no virtual key", h.id);
        }
    }

    #[test]
    fn chords_normalize_in_one_order() {
        assert_eq!(normalize("alt+shift+tab"), "alt+shift+tab");
        assert_eq!(normalize("ctrl+shift+t"), "ctrl+shift+t");
        assert_eq!(chord_text(m(|x| { x.win = true; x.shift = true }), "s"), normalize("win+shift+s"));
        assert_eq!(chord_text(m(|x| x.altgr = true), "q"), "altgr+q");
    }

    #[test]
    fn counts_only_library_habits_and_respects_the_family() {
        let r = Recorder::new(library::get());
        let ctrl_c = chord_text(m(|x| x.ctrl = true), "c");
        assert!(r.is_habit_chord(&ctrl_c));
        assert_eq!(r.action_for(&ctrl_c, "system"), Some("edit.copy"));
        assert_eq!(r.action_for(&ctrl_c, "browser"), Some("edit.copy"));
        // Plain typing and unknown combos are not habits: dropped in the hook.
        assert!(!r.is_habit_chord("q"));
        assert!(!r.is_habit_chord(&chord_text(m(|x| x.shift = true), "a")));
        assert!(!r.is_habit_chord(&chord_text(m(|x| x.ctrl = true), "k")));
        // Browser-only habit: counted in Chrome, not in Explorer.
        let ctrl_shift_t = chord_text(m(|x| { x.ctrl = true; x.shift = true }), "t");
        assert_eq!(r.family_of_exe("Chrome.exe"), "browser");
        assert_eq!(r.action_for(&ctrl_shift_t, "browser"), Some("browser.tab.reopen"));
        assert_eq!(r.action_for(&ctrl_shift_t, "files"), None);
        assert_eq!(r.family_of_exe("unknown.exe"), "system");
    }
}
