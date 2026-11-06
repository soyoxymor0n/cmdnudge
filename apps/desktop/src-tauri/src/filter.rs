//! The privacy filter. This is the file the landing page links to.
//!
//! cmdnudge sees every key-down the Mac delivers, because that is how an event tap works.
//! This function decides, inside the tap callback and before anything is queued, logged
//! or stored, whether a key press is a *key combination* worth looking at. Everything it
//! rejects is forgotten on the spot: letters, digits, Shift+letter, space, Return, all of it.
//!
//! A press is kept only if:
//! - Command, Control or Option is held (Shift alone does not count), or
//! - it is a function key (F1–F20), or
//! - it is Home, End or forward-Delete (classic Windows habits), alone or with Shift.
//!
//! Even a kept press is only ever stored as a counter of a known library action
//! (see `store.rs`); a combination that matches no action is dropped too.

/// Modifier state of one key press. Shift is listed so the filter can ignore it explicitly.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Held {
    pub cmd: bool,
    pub ctrl: bool,
    pub opt: bool,
    pub shift: bool,
}

/// Mac virtual key codes the filter treats specially.
pub mod keycode {
    pub const HOME: u16 = 115;
    pub const END: u16 = 119;
    pub const FORWARD_DELETE: u16 = 117;
    pub const FUNCTION_KEYS: [u16; 20] = [
        122, 120, 99, 118, 96, 97, 98, 100, 101, 109, 103, 111, // F1–F12
        105, 107, 113, 106, 64, 79, 80, 90, // F13–F20
    ];
}

/// true = this press is a key combination and may be looked at; false = forget it now.
pub fn is_key_combo(held: Held, key: u16) -> bool {
    if held.cmd || held.ctrl || held.opt {
        return true;
    }
    if keycode::FUNCTION_KEYS.contains(&key) {
        return true;
    }
    matches!(key, keycode::HOME | keycode::END | keycode::FORWARD_DELETE)
}

#[cfg(test)]
mod tests {
    use super::*;

    const NONE: Held = Held { cmd: false, ctrl: false, opt: false, shift: false };
    const SHIFT: Held = Held { shift: true, ..NONE };
    const CTRL: Held = Held { ctrl: true, ..NONE };
    const CMD: Held = Held { cmd: true, ..NONE };
    const OPT: Held = Held { opt: true, ..NONE };

    // Key codes: a=0, c=8, q=12, 1=18, space=49, return=36, F2=120, F4=118, tab=48, left=123.
    #[test]
    fn plain_typing_never_passes() {
        for key in [0u16, 8, 12, 18, 49, 36, 48, 51, 123] {
            assert!(!is_key_combo(NONE, key), "plain key {key} passed");
            assert!(!is_key_combo(SHIFT, key), "Shift+{key} passed");
        }
    }

    #[test]
    fn digits_and_space_never_pass() {
        for key in [18u16, 19, 20, 21, 23, 22, 26, 28, 25, 29, 49] {
            assert!(!is_key_combo(NONE, key));
        }
    }

    #[test]
    fn shortcuts_pass() {
        assert!(is_key_combo(CTRL, 8), "Ctrl+C");
        assert!(is_key_combo(CMD, 8), "⌘C");
        assert!(is_key_combo(CMD, 12), "right ⌘Q from AltGr+Q");
        assert!(is_key_combo(OPT, 12), "⌥Q from AltGr+Q on a PC keyboard");
        assert!(is_key_combo(NONE, 120), "F2");
        assert!(is_key_combo(CMD, 118), "Alt+F4 on an Apple keyboard");
    }

    #[test]
    fn windows_navigation_habits_pass() {
        assert!(is_key_combo(NONE, keycode::HOME));
        assert!(is_key_combo(SHIFT, keycode::END));
        assert!(is_key_combo(NONE, keycode::FORWARD_DELETE));
    }
}
