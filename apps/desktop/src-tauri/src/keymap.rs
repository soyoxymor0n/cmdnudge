//! Mac virtual key code -> the label on the keycap in the active layout.
//!
//! Key codes are positions, not letters: on a German keyboard the key at the US "Z"
//! position is labelled Y. Habits are written with keycap labels ("ctrl+z" = the key
//! printed Z), so the label depends on the layout. Facts: Mac Mouse Fix NG
//! layouts-us-de-at.tsv (UCKeyTranslate dump). Keys 10 and 50 are swapped on ISO
//! keyboards; the settings "Key check" shows what a key resolves to (Open-8).

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, RwLock};

/// One entry per layout in packages/library/src/layouts.json. Typing habits exist for all but
/// `Other`; on `Other` shortcuts still work with keycaps read at runtime (#33).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Hash)]
pub enum Layout {
    #[serde(rename = "us")]
    Us,
    /// German and Austrian are the same QWERTZ layout; "at" was its own id before #33.
    #[serde(rename = "de", alias = "at")]
    De,
    #[serde(rename = "ch-de")]
    ChDe,
    #[serde(rename = "ch-fr")]
    ChFr,
    #[serde(rename = "uk")]
    Uk,
    #[serde(rename = "uk-pc")]
    UkPc,
    #[serde(rename = "fr")]
    Fr,
    #[serde(rename = "fr-pc")]
    FrPc,
    #[serde(rename = "be")]
    Be,
    #[serde(rename = "es")]
    Es,
    #[serde(rename = "it")]
    It,
    #[serde(rename = "pt")]
    Pt,
    #[serde(rename = "se")]
    Se,
    #[serde(rename = "no")]
    No,
    #[serde(rename = "dk")]
    Dk,
    #[serde(rename = "pl")]
    Pl,
    #[serde(rename = "cz")]
    Cz,
    #[serde(rename = "hu")]
    Hu,
    #[serde(rename = "other")]
    Other,
}

pub const ALL: [Layout; 19] = [
    Layout::Us, Layout::De, Layout::ChDe, Layout::ChFr, Layout::Uk, Layout::UkPc, Layout::Fr, Layout::FrPc,
    Layout::Be, Layout::Es, Layout::It, Layout::Pt, Layout::Se, Layout::No, Layout::Dk, Layout::Pl,
    Layout::Cz, Layout::Hu, Layout::Other,
];

impl Layout {
    pub fn id(self) -> &'static str {
        match self {
            Layout::Us => "us",
            Layout::De => "de",
            Layout::ChDe => "ch-de",
            Layout::ChFr => "ch-fr",
            Layout::Uk => "uk",
            Layout::UkPc => "uk-pc",
            Layout::Fr => "fr",
            Layout::FrPc => "fr-pc",
            Layout::Be => "be",
            Layout::Es => "es",
            Layout::It => "it",
            Layout::Pt => "pt",
            Layout::Se => "se",
            Layout::No => "no",
            Layout::Dk => "dk",
            Layout::Pl => "pl",
            Layout::Cz => "cz",
            Layout::Hu => "hu",
            Layout::Other => "other",
        }
    }

    pub fn from_id(s: &str) -> Option<Layout> {
        if s == "at" {
            return Some(Layout::De);
        }
        ALL.into_iter().find(|l| l.id() == s)
    }

    /// TIS input source id -> layout, by the exact names in layouts.json. Anything else is
    /// `Other`: shortcuts still work (runtime keycaps), typing habits are not mapped.
    pub fn from_input_source(id: &str) -> Layout {
        let name = id.strip_prefix("com.apple.keylayout.").unwrap_or(id);
        crate::library::get()
            .layout_info
            .iter()
            .find(|l| l.mac.iter().any(|m| m == name))
            .and_then(|l| Layout::from_id(&l.id))
            .unwrap_or(Layout::Other)
    }
}

/// Keycaps of the active input source, read with UCKeyTranslate when the layout changes
/// (mac::keycaps). Keys 0..=50 only; the rest come from COMMON.
static RUNTIME: RwLock<Option<HashMap<u16, &'static str>>> = RwLock::new(None);

fn intern(s: String) -> &'static str {
    static POOL: Mutex<Option<HashSet<&'static str>>> = Mutex::new(None);
    let mut pool = POOL.lock().unwrap();
    let pool = pool.get_or_insert_with(HashSet::new);
    if let Some(found) = pool.get(s.as_str()) {
        return found;
    }
    let leaked: &'static str = Box::leak(s.into_boxed_str());
    pool.insert(leaked);
    leaked
}

/// The keycap label of a key from its [base, shift] characters, the rule the library generator
/// uses (packages/library/tools/layouts.mjs keyLabel): the unshifted character, or the digit
/// when the digit is on Shift (AZERTY number row); + - , . by name.
pub fn cap_label(base: &str, shift: &str) -> Option<String> {
    let b = base.chars().next()?;
    if base.chars().count() != 1 || b.is_control() || b.is_whitespace() {
        return None;
    }
    if shift.len() == 1 && shift.as_bytes()[0].is_ascii_digit() && !b.is_alphabetic() {
        return Some(shift.to_string());
    }
    let l = base.to_lowercase();
    Some(match l.as_str() {
        "+" => "plus".into(),
        "-" => "minus".into(),
        "," => "comma".into(),
        "." => "period".into(),
        _ => l,
    })
}

type Table = HashMap<u16, &'static str>;

fn build_table(keys: &[(u16, String, String)]) -> Option<Table> {
    let table = keys
        .iter()
        .filter_map(|(k, b, s)| cap_label(b, s).map(|l| (*k, intern(l))))
        .collect::<Table>();
    (!table.is_empty()).then_some(table)
}

/// Install the keycaps of the active layout: (hardware keycode, base, shift) per key.
pub fn set_runtime(keys: &[(u16, String, String)]) {
    *RUNTIME.write().unwrap() = build_table(keys);
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

/// Fallback before the first layout read (and in tests): German keycaps for German, US otherwise.
fn fallback(layout: Layout) -> &'static [(u16, &'static str)] {
    match layout {
        Layout::De => DE,
        _ => US,
    }
}

pub fn label(key: u16, layout: Layout) -> Option<&'static str> {
    label_in(RUNTIME.read().unwrap().as_ref(), key, layout)
}

fn label_in(runtime: Option<&Table>, key: u16, layout: Layout) -> Option<&'static str> {
    if let Some(l) = runtime.and_then(|t| t.get(&key).copied()) {
        return Some(l);
    }
    fallback(layout).iter().chain(COMMON.iter()).find(|(k, _)| *k == key).map(|(_, l)| *l)
}

/// Reverse lookup, for synthesizing the Mac shortcut in translate mode.
pub fn keycode(label: &str, layout: Layout) -> Option<u16> {
    keycode_in(RUNTIME.read().unwrap().as_ref(), label, layout)
}

fn keycode_in(runtime: Option<&Table>, label: &str, layout: Layout) -> Option<u16> {
    if let Some(t) = runtime {
        if let Some((k, _)) = t.iter().find(|(_, l)| **l == label) {
            return Some(*k);
        }
        // A printable key the active layout does not have: do not guess from a static table.
        if !COMMON.iter().any(|(_, l)| *l == label) {
            return None;
        }
    }
    fallback(layout).iter().chain(COMMON.iter()).find(|(_, l)| *l == label).map(|(k, _)| *k)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn y_and_z_swap_on_german_layouts() {
        assert_eq!(label(6, Layout::Us), Some("z"));
        assert_eq!(label(6, Layout::De), Some("y"));
        assert_eq!(label(16, Layout::from_id("at").unwrap()), Some("z"));
    }

    #[test]
    fn plus_key_moves() {
        assert_eq!(label(30, Layout::De), Some("plus"));
        assert_eq!(label(24, Layout::Us), Some("plus"));
        assert_eq!(label(27, Layout::De), Some("ß"));
    }

    #[test]
    fn input_sources() {
        assert_eq!(Layout::from_input_source("com.apple.keylayout.Austrian"), Layout::De);
        assert_eq!(Layout::from_input_source("com.apple.keylayout.German"), Layout::De);
        assert_eq!(Layout::from_input_source("com.apple.keylayout.German-DIN-2137"), Layout::De);
        assert_eq!(Layout::from_input_source("com.apple.keylayout.ABC"), Layout::Us);
        // #33: Swiss German is its own layout now (its AltGr+Q is not @, so no right-⌘Q guard).
        assert_eq!(Layout::from_input_source("com.apple.keylayout.SwissGerman"), Layout::ChDe);
        assert_eq!(Layout::from_input_source("com.apple.keylayout.PolishPro"), Layout::Pl);
        assert_eq!(Layout::from_input_source("com.apple.keylayout.Dvorak"), Layout::Other);
    }

    #[test]
    fn every_layout_id_round_trips_and_matches_the_library() {
        let ids: Vec<&str> = crate::library::get().layout_info.iter().map(|l| l.id.as_str()).collect();
        assert_eq!(ids, ALL.iter().map(|l| l.id()).collect::<Vec<_>>());
        for l in ALL {
            assert_eq!(Layout::from_id(l.id()), Some(l));
        }
        assert_eq!(serde_json::from_str::<Layout>("\"at\"").unwrap(), Layout::De);
    }

    #[test]
    fn cap_labels_follow_the_generator_rule() {
        assert_eq!(cap_label("&", "1").as_deref(), Some("1")); // AZERTY number row
        assert_eq!(cap_label("é", "2").as_deref(), Some("é")); // a letter stays a letter (Czech)
        assert_eq!(cap_label("Q", "q").as_deref(), Some("q"));
        assert_eq!(cap_label("+", "*").as_deref(), Some("plus"));
        assert_eq!(cap_label(" ", " "), None);
        assert_eq!(cap_label("\r", "\r"), None);
    }

    #[test]
    fn runtime_keycaps_win_over_the_static_tables() {
        // A French AZERTY Mac: the key at the US "A" position is labelled Q, the 1 key types &.
        let t = build_table(&[(0, "q".into(), "Q".into()), (12, "a".into(), "A".into()), (18, "&".into(), "1".into()), (49, " ".into(), " ".into())]);
        let t = t.as_ref();
        assert_eq!(label_in(t, 0, Layout::Fr), Some("q"));
        assert_eq!(label_in(t, 12, Layout::Fr), Some("a"));
        assert_eq!(label_in(t, 18, Layout::Fr), Some("1"));
        assert_eq!(label_in(t, 49, Layout::Fr), Some("space"), "space comes from COMMON");
        assert_eq!(keycode_in(t, "a", Layout::Fr), Some(12));
        assert_eq!(keycode_in(t, "tab", Layout::Fr), Some(48));
        assert_eq!(keycode_in(t, "ß", Layout::Fr), None, "no guessing from the German table");
    }

    #[test]
    fn reverse_lookup() {
        assert_eq!(keycode("l", Layout::De), Some(37));
        assert_eq!(keycode("z", Layout::De), Some(16));
    }
}
