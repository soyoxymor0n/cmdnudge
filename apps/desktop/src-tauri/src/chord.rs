//! A pressed key combination, and the chord patterns of the library ("rcmd+q", "ctrl+shift+t").

use serde::Serialize;

/// Which modifier keys are down, with sides where the side matters (AltGr arrives on the right).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
pub struct Mods {
    pub ctrl: bool,
    pub shift: bool,
    pub lopt: bool,
    pub ropt: bool,
    pub lcmd: bool,
    pub rcmd: bool,
}

impl Mods {
    pub fn opt(&self) -> bool {
        self.lopt || self.ropt
    }
    pub fn cmd(&self) -> bool {
        self.lcmd || self.rcmd
    }
}

/// One key press after the privacy filter: modifiers + the label of the key in the active layout.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Chord {
    pub mods: Mods,
    pub key: String,
}

/// A library chord pattern. `cmd`/`opt` match either side; `lcmd`/`rcmd`/`lopt`/`ropt` one side.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Pattern {
    ctrl: bool,
    shift: bool,
    opt: Side,
    cmd: Side,
    pub key: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Side {
    None,
    Any,
    Left,
    Right,
}

impl Side {
    fn accepts(self, left: bool, right: bool) -> bool {
        match self {
            Side::None => !left && !right,
            Side::Any => left || right,
            Side::Left => left && !right,
            Side::Right => right && !left,
        }
    }
}

impl Pattern {
    pub fn parse(s: &str) -> Result<Pattern, String> {
        let mut parts: Vec<&str> = s.split('+').collect();
        let key = parts.pop().filter(|k| !k.is_empty()).ok_or_else(|| format!("no key in {s}"))?;
        let mut p = Pattern { ctrl: false, shift: false, opt: Side::None, cmd: Side::None, key: key.to_string() };
        for m in parts {
            match m {
                "ctrl" => p.ctrl = true,
                "shift" => p.shift = true,
                "opt" => p.opt = Side::Any,
                "lopt" => p.opt = Side::Left,
                "ropt" => p.opt = Side::Right,
                "cmd" => p.cmd = Side::Any,
                "lcmd" => p.cmd = Side::Left,
                "rcmd" => p.cmd = Side::Right,
                other => return Err(format!("unknown modifier {other} in {s}")),
            }
        }
        Ok(p)
    }

    pub fn matches(&self, c: &Chord) -> bool {
        self.key == c.key
            && self.ctrl == c.mods.ctrl
            && self.shift == c.mods.shift
            && self.opt.accepts(c.mods.lopt, c.mods.ropt)
            && self.cmd.accepts(c.mods.lcmd, c.mods.rcmd)
    }

    /// Modifiers + key for synthesizing this chord (translate mode). Sided patterns use that side.
    pub fn as_mods(&self) -> Mods {
        Mods {
            ctrl: self.ctrl,
            shift: self.shift,
            lopt: matches!(self.opt, Side::Any | Side::Left),
            ropt: matches!(self.opt, Side::Right),
            lcmd: matches!(self.cmd, Side::Any | Side::Left),
            rcmd: matches!(self.cmd, Side::Right),
        }
    }
}

fn key_symbol(key: &str, mac: bool) -> String {
    let s = match (key, mac) {
        ("left", _) => "←",
        ("right", _) => "→",
        ("up", _) => "↑",
        ("down", _) => "↓",
        ("backspace", true) => "⌫",
        ("backspace", false) => "Backspace",
        ("fwddelete", true) => "⌦",
        ("fwddelete", false) => "Del",
        ("return", true) => "↩",
        ("return", false) => "Enter",
        ("esc", true) => "⎋",
        ("esc", false) => "Esc",
        ("tab", true) => "⇥",
        ("tab", false) => "Tab",
        ("space", _) => "Space",
        ("home", true) => "↖",
        ("home", false) => "Home",
        ("end", true) => "↘",
        ("end", false) => "End",
        ("pageup", _) => "PgUp",
        ("pagedown", _) => "PgDn",
        ("plus", _) => "+",
        ("minus", _) => "-",
        ("period", _) => ".",
        ("comma", _) => ",",
        _ => return key.to_uppercase(),
    };
    s.to_string()
}

/// "shift+cmd+4" -> "⇧⌘4" (Apple's order: ⌃⌥⇧⌘).
pub fn format_mac(pattern: &str) -> String {
    let Ok(p) = Pattern::parse(pattern) else { return pattern.to_string() };
    let mut s = String::new();
    if p.ctrl {
        s.push('⌃');
    }
    if p.opt != Side::None {
        s.push('⌥');
    }
    if p.shift {
        s.push('⇧');
    }
    if p.cmd != Side::None {
        s.push('⌘');
    }
    s + &key_symbol(&p.key, true)
}

/// A pressed chord in Mac symbols, with "right" when a right-side ⌘/⌥ is what made it special.
pub fn format_pressed(c: &Chord) -> String {
    let mut s = String::new();
    if c.mods.rcmd && !c.mods.lcmd || c.mods.ropt && !c.mods.lopt {
        s.push_str("right ");
    }
    if c.mods.ctrl {
        s.push('⌃');
    }
    if c.mods.opt() {
        s.push('⌥');
    }
    if c.mods.shift {
        s.push('⇧');
    }
    if c.mods.cmd() {
        s.push('⌘');
    }
    s + &key_symbol(&c.key, true)
}

/// "ctrl+shift+t" -> "Ctrl+Shift+T".
pub fn format_windows(chord: &str) -> String {
    let mut parts: Vec<&str> = chord.split('+').collect();
    let key = parts.pop().unwrap_or_default();
    let mut out: Vec<String> = parts
        .iter()
        .map(|m| match *m {
            "ctrl" => "Ctrl",
            "win" => "Win",
            "alt" => "Alt",
            "altgr" => "AltGr",
            "shift" => "Shift",
            other => other,
        })
        .map(String::from)
        .collect();
    out.push(key_symbol(key, false));
    out.join("+")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chord(mods: Mods, key: &str) -> Chord {
        Chord { mods, key: key.into() }
    }

    #[test]
    fn sided_patterns() {
        let rq = Pattern::parse("rcmd+q").unwrap();
        assert!(rq.matches(&chord(Mods { rcmd: true, ..Default::default() }, "q")));
        assert!(!rq.matches(&chord(Mods { lcmd: true, ..Default::default() }, "q")), "deliberate left ⌘Q must not match");
        let any = Pattern::parse("cmd+q").unwrap();
        assert!(any.matches(&chord(Mods { lcmd: true, ..Default::default() }, "q")));
        assert!(any.matches(&chord(Mods { rcmd: true, ..Default::default() }, "q")));
    }

    #[test]
    fn exact_modifier_sets() {
        let p = Pattern::parse("ctrl+c").unwrap();
        assert!(p.matches(&chord(Mods { ctrl: true, ..Default::default() }, "c")));
        assert!(!p.matches(&chord(Mods { ctrl: true, shift: true, ..Default::default() }, "c")));
        assert!(!p.matches(&chord(Mods { ctrl: true, lcmd: true, ..Default::default() }, "c")));
    }

    #[test]
    fn formatting() {
        assert_eq!(format_mac("shift+cmd+4"), "⇧⌘4");
        assert_eq!(format_mac("opt+cmd+space"), "⌥⌘Space");
        assert_eq!(format_windows("win+shift+s"), "Win+Shift+S");
        assert_eq!(format_windows("altgr+q"), "AltGr+Q");
        assert_eq!(format_pressed(&chord(Mods { rcmd: true, ..Default::default() }, "q")), "right ⌘Q");
    }
}
