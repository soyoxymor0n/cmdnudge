//! Chord + context -> what it means: a Windows habit that slipped, a correct Mac shortcut, or nothing.

use crate::chord::Chord;
use crate::keymap::Layout;
use crate::library::{HabitRule, Keyboard, Library};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Exclusion {
    /// Normal app: everything applies.
    None,
    /// Terminals: Ctrl habits are correct there; only typing habits (AltGr+Q) and guards apply.
    Hints,
    /// Remote desktop and VMs: Windows shortcuts are correct; nothing applies.
    All,
}

pub struct Context<'a> {
    pub layout: Layout,
    pub keyboard: Keyboard,
    pub family: &'a str,
    pub exclusion: Exclusion,
}

#[derive(Debug, PartialEq)]
pub enum Outcome<'a> {
    Habit(&'a HabitRule),
    Correct { action: &'a str },
}

pub fn evaluate<'a>(lib: &'a Library, ctx: &Context, chord: &Chord) -> Option<Outcome<'a>> {
    if ctx.exclusion == Exclusion::All {
        return None;
    }
    let applies = |r: &HabitRule| {
        r.layout == ctx.layout
            && r.keyboard == ctx.keyboard
            && (ctx.exclusion == Exclusion::None || r.category == "typing" || r.guard)
            && r.pattern.as_ref().is_some_and(|p| p.matches(chord))
    };
    // App-specific rules win over universal ones (Ctrl+H is History in a browser, Replace elsewhere).
    let habit = lib
        .habit_rules
        .iter()
        .find(|r| r.family == ctx.family && applies(r))
        .or_else(|| lib.habit_rules.iter().find(|r| r.family == "system" && applies(r)));
    if let Some(r) = habit {
        return Some(Outcome::Habit(r));
    }
    if ctx.exclusion != Exclusion::None {
        return None;
    }
    lib.mac_ways
        .iter()
        .filter(|w| w.family == ctx.family || w.family == "system")
        .find(|w| w.layouts.contains(&ctx.layout) && w.pattern.as_ref().is_some_and(|p| p.matches(chord)))
        .map(|w| Outcome::Correct { action: &w.action })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chord::Mods;
    use crate::library;

    fn ctx(layout: Layout, keyboard: Keyboard, family: &str) -> Context<'_> {
        Context { layout, keyboard, family, exclusion: Exclusion::None }
    }
    fn c(mods: Mods, key: &str) -> Chord {
        Chord { mods, key: key.into() }
    }
    const CTRL: Mods = Mods { ctrl: true, shift: false, lopt: false, ropt: false, lcmd: false, rcmd: false };
    const LCMD: Mods = Mods { ctrl: false, shift: false, lopt: false, ropt: false, lcmd: true, rcmd: false };
    const RCMD: Mods = Mods { ctrl: false, shift: false, lopt: false, ropt: false, lcmd: false, rcmd: true };

    fn habit_id(o: Option<Outcome>) -> Option<String> {
        match o {
            Some(Outcome::Habit(r)) => Some(r.habit.clone()),
            _ => None,
        }
    }

    #[test]
    fn ctrl_c_in_chrome_is_a_copy_habit() {
        let lib = library::get();
        let o = evaluate(lib, &ctx(Layout::Us, Keyboard::Apple, "browser"), &c(CTRL, "c"));
        assert_eq!(habit_id(o), Some("copy".into()));
    }

    #[test]
    fn family_rule_wins_over_system_rule() {
        let lib = library::get();
        // Ctrl+U: underline everywhere, view source in a browser.
        let o = evaluate(lib, &ctx(Layout::Us, Keyboard::Apple, "browser"), &c(CTRL, "u"));
        assert_eq!(habit_id(o), Some("view-source".into()));
        let o = evaluate(lib, &ctx(Layout::Us, Keyboard::Apple, "office"), &c(CTRL, "u"));
        assert_eq!(habit_id(o), Some("underline".into()));
    }

    #[test]
    fn right_cmd_q_is_guarded_on_austrian_apple_keyboards_only() {
        let lib = library::get();
        match evaluate(lib, &ctx(Layout::De, Keyboard::Apple, "chat"), &c(RCMD, "q")) {
            Some(Outcome::Habit(r)) => assert!(r.guard && r.habit == "at-sign"),
            other => panic!("expected the @ guard, got {other:?}"),
        }
        // Deliberate quit with the left ⌘ is never touched.
        assert_eq!(habit_id(evaluate(lib, &ctx(Layout::De, Keyboard::Apple, "chat"), &c(LCMD, "q"))), None);
        // US layout has no AltGr habit.
        assert_eq!(habit_id(evaluate(lib, &ctx(Layout::Us, Keyboard::Apple, "chat"), &c(RCMD, "q"))), None);
        // A PC keyboard sends right ⌥ for AltGr, so right ⌘Q is deliberate there.
        assert_eq!(habit_id(evaluate(lib, &ctx(Layout::De, Keyboard::Pc, "chat"), &c(RCMD, "q"))), None);
    }

    #[test]
    fn ctrl_z_on_german_layout_uses_the_keycap_label() {
        let lib = library::get();
        let o = evaluate(lib, &ctx(Layout::De, Keyboard::Apple, "system"), &c(CTRL, "z"));
        assert_eq!(habit_id(o), Some("undo".into()));
    }

    #[test]
    fn cmd_c_counts_as_correct_use() {
        let lib = library::get();
        let o = evaluate(lib, &ctx(Layout::Us, Keyboard::Apple, "files"), &c(LCMD, "c"));
        assert_eq!(o, Some(Outcome::Correct { action: "edit.copy" }));
    }

    #[test]
    fn terminals_keep_typing_guards_but_drop_ctrl_hints() {
        let lib = library::get();
        let t = Context { exclusion: Exclusion::Hints, ..ctx(Layout::De, Keyboard::Apple, "terminal") };
        assert_eq!(habit_id(evaluate(lib, &t, &c(CTRL, "c"))), None);
        assert_eq!(habit_id(evaluate(lib, &t, &c(RCMD, "q"))), Some("at-sign".into()));
        let vm = Context { exclusion: Exclusion::All, ..ctx(Layout::De, Keyboard::Apple, "remote") };
        assert_eq!(evaluate(lib, &vm, &c(RCMD, "q")), None);
    }

    #[test]
    fn ctrl_left_is_a_word_jump_habit() {
        let lib = library::get();
        let o = evaluate(lib, &ctx(Layout::Us, Keyboard::Pc, "system"), &c(CTRL, "left"));
        assert_eq!(habit_id(o), Some("word-left".into()));
    }
}
