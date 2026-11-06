//! Mac virtual key code -> the label on the keycap in the active layout.
//!
//! Key codes are positions, not letters: on a German keyboard the key at the US "Z"
//! position is labelled Y. Habits are written with keycap labels ("ctrl+z" = the key
//! printed Z), so the label depends on the layout. Facts: Mac Mouse Fix NG
//! layouts-us-de-at.tsv (UCKeyTranslate dump). Keys 10 and 50 are swapped on ISO
//! keyboards; the settings "Key check" shows what a key resolves to (Open-8).

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Layout {
    Us,
    De,
    At,
}

impl Layout {
    pub fn id(self) -> &'static str {
        match self {
            Layout::Us => "us",
            Layout::De => "de",
            Layout::At => "at",
        }
    }

    pub fn from_id(s: &str) -> Option<Layout> {
        match s {
            "us" => Some(Layout::Us),
            "de" => Some(Layout::De),
            "at" => Some(Layout::At),
            _ => None,
        }
    }

    /// TIS input source id -> layout. Unknown layouts fall back to US keycaps.
    pub fn from_input_source(id: &str) -> Layout {
        let name = id.rsplit('.').next().unwrap_or(id).to_ascii_lowercase();
        if name.starts_with("austrian") {
            Layout::At
        } else if name.starts_with("german") || name.starts_with("swissgerman") {
            Layout::De
        } else {
            Layout::Us
        }
    }
}

const COMMON: &[(u16, &str)] = &[
    (0, "a"), (1, "s"), (2, "d"), (3, "f"), (4, "h"), (5, "g"), (7, "x"), (8, "c"), (9, "v"),
    (11, "b"), (12, "q"), (13, "w"), (14, "e"), (15, "r"), (17, "t"),
    (18, "1"), (19, "2"), (20, "3"), (21, "4"), (22, "6"), (23, "5"), (25, "9"), (26, "7"), (28, "8"), (29, "0"),
    (31, "o"), (32, "u"), (34, "i"), (35, "p"), (36, "return"), (37, "l"), (38, "j"), (40, "k"),
    (43, "comma"), (45, "n"), (46, "m"), (47, "period"), (48, "tab"), (49, "space"), (51, "backspace"), (53, "esc"),
    (69, "plus"), (78, "minus"), (76, "return"),
    (122, "f1"), (120, "f2"), (99, "f3"), (118, "f4"), (96, "f5"), (97, "f6"), (98, "f7"), (100, "f8"),
    (101, "f9"), (109, "f10"), (103, "f11"), (111, "f12"), (105, "f13"), (107, "f14"), (113, "f15"),
    (106, "f16"), (64, "f17"), (79, "f18"), (80, "f19"), (90, "f20"),
    (115, "home"), (119, "end"), (116, "pageup"), (121, "pagedown"), (117, "fwddelete"),
    (123, "left"), (124, "right"), (125, "down"), (126, "up"),
];

const US: &[(u16, &str)] = &[
    (6, "z"), (16, "y"), (24, "plus"), (27, "minus"), (33, "["), (30, "]"), (41, ";"), (39, "'"),
    (42, "\\"), (44, "/"), (50, "`"), (10, "§"),
];

const DE: &[(u16, &str)] = &[
    (6, "y"), (16, "z"), (24, "´"), (27, "ß"), (30, "plus"), (33, "ü"), (41, "ö"), (39, "ä"),
    (42, "#"), (44, "minus"), (10, "<"), (50, "^"),
];

pub fn label(key: u16, layout: Layout) -> Option<&'static str> {
    let specific = match layout {
        Layout::Us => US,
        Layout::De | Layout::At => DE,
    };
    specific.iter().chain(COMMON.iter()).find(|(k, _)| *k == key).map(|(_, l)| *l)
}

/// Reverse lookup, for synthesizing the Mac shortcut in translate mode.
pub fn keycode(label: &str, layout: Layout) -> Option<u16> {
    let specific = match layout {
        Layout::Us => US,
        Layout::De | Layout::At => DE,
    };
    specific.iter().chain(COMMON.iter()).find(|(_, l)| *l == label).map(|(k, _)| *k)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn y_and_z_swap_on_german_layouts() {
        assert_eq!(label(6, Layout::Us), Some("z"));
        assert_eq!(label(6, Layout::De), Some("y"));
        assert_eq!(label(16, Layout::At), Some("z"));
    }

    #[test]
    fn plus_key_moves() {
        assert_eq!(label(30, Layout::De), Some("plus"));
        assert_eq!(label(24, Layout::Us), Some("plus"));
        assert_eq!(label(27, Layout::At), Some("ß"));
    }

    #[test]
    fn input_sources() {
        assert_eq!(Layout::from_input_source("com.apple.keylayout.Austrian"), Layout::At);
        assert_eq!(Layout::from_input_source("com.apple.keylayout.German"), Layout::De);
        assert_eq!(Layout::from_input_source("com.apple.keylayout.German-DIN-2"), Layout::De);
        assert_eq!(Layout::from_input_source("com.apple.keylayout.ABC"), Layout::Us);
    }

    #[test]
    fn reverse_lookup() {
        assert_eq!(keycode("l", Layout::De), Some(37));
        assert_eq!(keycode("z", Layout::De), Some(16));
    }
}
