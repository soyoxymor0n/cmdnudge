//! Mouse-to-menu tips (#19): when a menu item that has a keyboard shortcut is picked with the
//! mouse for the third time, show the shortcut once ("Tip  ⌘⇧T · Reopen Closed Tab").
//!
//! Platform-free logic: shortcut formatting from the Accessibility attributes, the "picked with
//! the mouse" decision, and the per-item threshold. The macOS observer lives in `mac::menus`.
//!
//! Privacy: menu titles are held in memory only while a menu is open, and per-item counts are
//! keyed by a hash in memory; nothing here reaches the database or a file (invariant 5).

use std::collections::HashMap;
use std::time::{Duration, Instant};

/// D8: the Key Promoter X threshold.
pub const THRESHOLD: u32 = 3;
/// After a tip, the same item stays quiet this long even if it keeps being clicked.
pub const QUIET_AFTER_TIP: Duration = Duration::from_secs(30 * 60);

/// AXMenuItemCmdModifiers bits: 0 = ⌘ only; 1 shift, 2 option, 4 control, 8 = no ⌘.
pub fn format_shortcut(cmd_char: Option<&str>, modifiers: i64, glyph: Option<i64>) -> Option<String> {
    let key = match cmd_char.map(str::trim).filter(|c| !c.is_empty()) {
        Some(c) => match c {
            "\u{8}" | "\u{7f}" => "⌫".to_string(),
            "\r" | "\u{3}" => "↩".to_string(),
            "\t" => "⇥".to_string(),
            "\u{1b}" => "⎋".to_string(),
            c => c.to_uppercase(),
        },
        None => glyph_symbol(glyph?)?.to_string(),
    };
    let mut s = String::new();
    if modifiers & 4 != 0 {
        s.push('⌃');
    }
    if modifiers & 2 != 0 {
        s.push('⌥');
    }
    if modifiers & 1 != 0 {
        s.push('⇧');
    }
    if modifiers & 8 == 0 {
        s.push('⌘');
    }
    if s.is_empty() {
        // A bare key (F-key, Delete) is not something worth a tip.
        return None;
    }
    s.push_str(&key);
    Some(s)
}

/// Menu glyph codes (Carbon kMenu*Glyph) for the keys menus commonly show without a character.
fn glyph_symbol(g: i64) -> Option<&'static str> {
    Some(match g {
        0x17 => "⌫",
        0x0A => "⌦",
        0x64 => "←",
        0x65 => "→",
        0x68 => "↑",
        0x6A => "↓",
        0x04 => "↩",
        0x0B => "↩",
        0x02 => "⇥",
        0x1B => "⎋",
        0x09 => "Space",
        _ => return None,
    })
}

/// How long after a menu closed its click may still show up. macOS registers the mouse-up that
/// picks a menu item only once the menu's tracking loop ends, which can be after AXMenuClosed
/// (seen on macOS 26: 0.6 to 1.9 s later in Finder), so the verdict waits for it.
pub const UP_AFTER_CLOSE_SECS: f64 = 2.0;

#[derive(Debug, PartialEq, Eq)]
pub enum Verdict {
    Picked,
    NotPicked,
    /// No qualifying mouse-up yet; ask again shortly.
    Wait,
}

pub fn inside(pointer: (f64, f64), frame: (f64, f64, f64, f64)) -> bool {
    let (x, y, w, h) = frame;
    pointer.0 >= x && pointer.0 <= x + w && pointer.1 >= y && pointer.1 <= y + h
}

/// A menu closed with the pointer over its highlighted item (`inside` decided that at close).
/// Was the item picked with the mouse? Yes when the last left mouse-up happened after the item
/// was highlighted and no later than shortly after the close. Return/Enter and Escape have no
/// such mouse-up (the last one opened the menu, before the highlight); a click elsewhere fails
/// `inside`.
///
/// `highlighted_secs`: how long the item had been highlighted when the menu closed.
/// `since_close`, `since_up`: seconds from the close and from the last mouse-up until now.
pub fn judge(highlighted_secs: f64, since_close: f64, since_up: f64) -> Verdict {
    // Seconds the mouse-up came before the close (negative: after it).
    let up_before_close = since_up - since_close;
    if up_before_close < highlighted_secs && up_before_close > -UP_AFTER_CLOSE_SECS {
        Verdict::Picked
    } else if since_close < UP_AFTER_CLOSE_SECS {
        Verdict::Wait
    } else {
        Verdict::NotPicked
    }
}

#[derive(Default)]
pub struct Tracker {
    items: HashMap<u64, (u32, Option<Instant>)>,
}

impl Tracker {
    /// Counts a mouse pick of one menu item; true when the tip should show now.
    pub fn picked(&mut self, item: u64, now: Instant) -> bool {
        let e = self.items.entry(item).or_insert((0, None));
        e.0 += 1;
        let quiet = e.1.is_some_and(|t| now.duration_since(t) < QUIET_AFTER_TIP);
        if e.0 >= THRESHOLD && !quiet {
            e.1 = Some(now);
            return true;
        }
        false
    }
}

/// In-memory key for one menu item of one app.
pub fn item_key(bundle_id: &str, title: &str, shortcut: &str) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    (bundle_id, title, shortcut).hash(&mut h);
    h.finish()
}

/// Standard macOS window traffic-light buttons.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowButton {
    Close,
    Minimize,
    Maximize,
}

/// Maps an Accessibility `AXSubrole` value to a window button kind.
pub fn window_button_from_subrole(subrole: &str) -> Option<WindowButton> {
    match subrole {
        "AXCloseButton" => Some(WindowButton::Close),
        "AXMinimizeButton" => Some(WindowButton::Minimize),
        "AXFullScreenButton" | "AXZoomButton" => Some(WindowButton::Maximize),
        _ => None,
    }
}

/// Returns `(shortcut, detail)` for a window button tip.
pub fn window_button_tip(button: WindowButton) -> (&'static str, &'static str) {
    match button {
        WindowButton::Close => ("⌘W", "Close window"),
        WindowButton::Minimize => ("⌘M", "Minimize window"),
        WindowButton::Maximize => ("⌃⌘F", "Full screen"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shortcuts_read_like_the_menu() {
        assert_eq!(format_shortcut(Some("t"), 1, None).as_deref(), Some("⇧⌘T"));
        assert_eq!(format_shortcut(Some("C"), 0, None).as_deref(), Some("⌘C"));
        assert_eq!(format_shortcut(Some("f"), 4, None).as_deref(), Some("⌃⌘F"));
        assert_eq!(format_shortcut(Some("\u{8}"), 0, None).as_deref(), Some("⌘⌫"));
        assert_eq!(format_shortcut(None, 2 | 8, Some(0x65)).as_deref(), Some("⌥→"));
        // No shortcut at all, or a bare key, is no tip.
        assert_eq!(format_shortcut(None, 0, None), None);
        assert_eq!(format_shortcut(Some(""), 0, None), None);
        assert_eq!(format_shortcut(Some("x"), 8, None), None);
    }

    #[test]
    fn only_a_click_on_the_item_counts() {
        let frame = (100.0, 200.0, 220.0, 22.0);
        assert!(inside((150.0, 210.0), frame));
        // Pointer elsewhere: clicked outside the menu to dismiss it.
        assert!(!inside((150.0, 260.0), frame));
        // Clicked 0.2 s before the close, highlighted for 0.8 s.
        assert_eq!(judge(0.8, 0.0, 0.2), Verdict::Picked);
        // macOS registers the mouse-up after the close: not there yet, then it is.
        assert_eq!(judge(1.1, 0.0, 1.9), Verdict::Wait);
        assert_eq!(judge(1.1, 0.8, 0.1), Verdict::Picked);
        // Return/Enter or Escape: the last mouse-up opened the menu, before the highlight.
        assert_eq!(judge(0.3, 0.0, 1.0), Verdict::Wait);
        assert_eq!(judge(0.3, 2.5, 3.5), Verdict::NotPicked);
        // A click long after the menu closed is something else.
        assert_eq!(judge(0.3, 2.5, 0.1), Verdict::NotPicked);
    }

    #[test]
    fn tip_on_the_third_pick_then_quiet() {
        let mut t = Tracker::default();
        let now = Instant::now();
        let a = item_key("com.google.Chrome", "Reopen Closed Tab", "⇧⌘T");
        let b = item_key("com.google.Chrome", "New Tab", "⌘T");
        assert!(!t.picked(a, now));
        assert!(!t.picked(a, now));
        assert!(!t.picked(b, now));
        assert!(t.picked(a, now));
        assert!(!t.picked(a, now + Duration::from_secs(60)));
        assert!(t.picked(a, now + QUIET_AFTER_TIP + Duration::from_secs(1)));
    }

    #[test]
    fn window_buttons_map_to_shortcuts() {
        assert_eq!(window_button_from_subrole("AXCloseButton"), Some(WindowButton::Close));
        assert_eq!(window_button_from_subrole("AXMinimizeButton"), Some(WindowButton::Minimize));
        assert_eq!(window_button_from_subrole("AXFullScreenButton"), Some(WindowButton::Maximize));
        assert_eq!(window_button_from_subrole("AXZoomButton"), Some(WindowButton::Maximize));
        assert_eq!(window_button_from_subrole("AXToolbarButton"), None);

        assert_eq!(window_button_tip(WindowButton::Close), ("⌘W", "Close window"));
        assert_eq!(window_button_tip(WindowButton::Minimize), ("⌘M", "Minimize window"));
        assert_eq!(window_button_tip(WindowButton::Maximize), ("⌃⌘F", "Full screen"));
    }
}
