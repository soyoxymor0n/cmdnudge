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

/// A menu closed. Was the highlighted item picked with the mouse? Yes when a left mouse-up
/// happened just now, after the item was highlighted, with the pointer over the item.
/// Return/Enter, Escape and clicks elsewhere all fail one of the three.
pub fn picked_by_mouse(secs_since_mouse_up: f64, highlighted_for: Duration, pointer: (f64, f64), frame: (f64, f64, f64, f64)) -> bool {
    let (x, y, w, h) = frame;
    let inside = pointer.0 >= x && pointer.0 <= x + w && pointer.1 >= y && pointer.1 <= y + h;
    secs_since_mouse_up >= 0.0 && secs_since_mouse_up < 1.0 && highlighted_for.as_secs_f64() > secs_since_mouse_up && inside
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
        let on = (150.0, 210.0);
        let off = (150.0, 260.0);
        let long = Duration::from_millis(800);
        assert!(picked_by_mouse(0.2, long, on, frame));
        // Pointer elsewhere: clicked outside the menu to dismiss it.
        assert!(!picked_by_mouse(0.2, long, off, frame));
        // No recent mouse-up: chosen with Return, or closed with Escape.
        assert!(!picked_by_mouse(4.0, long, on, frame));
        // Highlighted after the last mouse-up (the click opened the menu, then Escape).
        assert!(!picked_by_mouse(0.5, Duration::from_millis(200), on, frame));
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
}
