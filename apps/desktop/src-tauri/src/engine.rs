//! Glue between the platform capture layer and the core: decides what happens to a key press
//! (pass, block, replace), and hands counting + toasts to a worker thread so the event tap
//! callback stays fast.

use crate::chord::{format_mac, format_pressed, format_windows, Chord, Pattern};
use crate::keymap::Layout;
use crate::library::{self, Keyboard};
use crate::matcher::{self, Context, Exclusion, Outcome};
use crate::settings::{Mode, Settings};
use crate::store::{self, Kind, Store};
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::mpsc::{channel, Sender};
use std::sync::{Mutex, OnceLock, RwLock};

#[derive(Debug, PartialEq)]
pub enum Decision {
    Pass,
    Block,
    /// Block, and send this Mac chord instead (translate mode).
    Replace(Pattern),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ToastStyle {
    Hint,
    Guard,
    Quiet,
    /// Mouse-to-menu tip: neutral, "Tip" in front (04-design.md item 6).
    Tip,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct ToastSpec {
    pub from: String,
    pub to: String,
    pub detail: String,
    pub style: ToastStyle,
    pub duration_ms: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentHint {
    pub from: String,
    pub to: String,
    pub label: String,
    pub guarded: bool,
}

/// The last kept key combination, shown live in Settings > Key check. Memory only, never stored.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyCheck {
    pub pressed: String,
    pub family: String,
    pub meaning: Option<String>,
}

enum Job {
    Habit { rule_id: String, family: String, app: String, blocked: bool, translated: bool },
    Correct { action: String, family: String },
}

pub struct Engine {
    pub store: Mutex<Store>,
    pub settings: RwLock<Settings>,
    pub detected_layout: RwLock<(Layout, String)>,
    pub recent: Mutex<VecDeque<RecentHint>>,
    pub key_check: Mutex<Option<KeyCheck>>,
    jobs: Mutex<Option<Sender<Job>>>,
    toast: OnceLock<Box<dyn Fn(ToastSpec) + Send + Sync>>,
    changed: OnceLock<Box<dyn Fn() + Send + Sync>>,
}

pub fn now() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

impl Engine {
    pub fn new(store: Store) -> Engine {
        let settings = store
            .setting("settings")
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        Engine {
            store: Mutex::new(store),
            settings: RwLock::new(settings),
            detected_layout: RwLock::new((Layout::Us, String::new())),
            recent: Mutex::new(VecDeque::new()),
            key_check: Mutex::new(None),
            jobs: Mutex::new(None),
            toast: OnceLock::new(),
            changed: OnceLock::new(),
        }
    }

    pub fn on_toast(&self, f: impl Fn(ToastSpec) + Send + Sync + 'static) {
        let _ = self.toast.set(Box::new(f));
    }

    pub fn on_changed(&self, f: impl Fn() + Send + Sync + 'static) {
        let _ = self.changed.set(Box::new(f));
    }

    pub fn start_worker(&'static self) {
        let (tx, rx) = channel::<Job>();
        *self.jobs.lock().unwrap() = Some(tx);
        std::thread::Builder::new()
            .name("cmdnudge-worker".into())
            .spawn(move || {
                for job in rx {
                    self.handle(job);
                }
            })
            .expect("worker thread");
    }

    pub fn save_settings(&self, s: Settings) {
        if let Ok(json) = serde_json::to_string(&s) {
            let _ = self.store.lock().unwrap().set_setting("settings", &json);
        }
        *self.settings.write().unwrap() = s;
        self.notify();
    }

    pub fn layout(&self) -> Layout {
        let s = self.settings.read().unwrap();
        Layout::from_id(&s.layout).unwrap_or_else(|| self.detected_layout.read().unwrap().0)
    }

    pub fn keyboard(&self) -> Keyboard {
        match self.settings.read().unwrap().keyboard.as_str() {
            "pc" => Keyboard::Pc,
            _ => Keyboard::Apple,
        }
    }

    /// Whether a mouse-to-menu tip may show for this app now: switched on, not paused, and the
    /// app family is neither excluded nor muted.
    pub fn menu_tips_allowed(&self, bundle_id: &str) -> bool {
        let settings = self.settings.read().unwrap().clone();
        if !settings.menu_tips || settings.is_paused(now()) {
            return false;
        }
        let family = library::get().family_of(bundle_id).id.clone();
        self.exclusion(&family, &settings) == Exclusion::None && !settings.muted_families.iter().any(|f| *f == family)
    }

    fn exclusion(&self, family: &str, settings: &Settings) -> Exclusion {
        let lib = library::get();
        if settings.include_families.iter().any(|f| f == family) {
            return Exclusion::None;
        }
        match lib.family(family).and_then(|f| f.exclude.as_deref()) {
            Some("all") => Exclusion::All,
            Some("hints") => Exclusion::Hints,
            _ => Exclusion::None,
        }
    }

    /// Called from the event tap callback with a press that already passed the privacy filter.
    /// Must be quick: no I/O here, the worker does the counting and the toast.
    pub fn on_key(&self, chord: &Chord, bundle_id: &str, app_name: &str, repeat: bool) -> Decision {
        let settings = self.settings.read().unwrap().clone();
        if settings.is_paused(now()) {
            return Decision::Pass;
        }
        let lib = library::get();
        let family = lib.family_of(bundle_id);
        let ctx = Context {
            layout: self.layout(),
            keyboard: self.keyboard(),
            family: &family.id,
            exclusion: self.exclusion(&family.id, &settings),
        };
        let outcome = matcher::evaluate(lib, &ctx, chord);
        *self.key_check.lock().unwrap() = Some(KeyCheck {
            pressed: format_pressed(chord),
            family: family.label.clone(),
            meaning: match &outcome {
                Some(Outcome::Habit(r)) => Some(format!("habit {} → {}", format_windows(&r.windows), format_mac(&r.mac[0]))),
                Some(Outcome::Correct { action }) => lib.action(action).map(|a| format!("the Mac way: {}", a.label)),
                None => None,
            },
        });
        let decision = match &outcome {
            Some(Outcome::Habit(r)) if r.guard && settings.guard => Decision::Block,
            Some(Outcome::Habit(_)) if settings.mode == Mode::Strict => Decision::Block,
            Some(Outcome::Habit(r)) if settings.mode == Mode::Translate => {
                Pattern::parse(&r.mac[0]).map(Decision::Replace).unwrap_or(Decision::Pass)
            }
            _ => Decision::Pass,
        };
        if !repeat {
            let job = match outcome {
                Some(Outcome::Habit(r)) => Some(Job::Habit {
                    rule_id: r.id.clone(),
                    family: family.id.clone(),
                    app: app_name.to_string(),
                    blocked: decision == Decision::Block,
                    translated: matches!(decision, Decision::Replace(_)),
                }),
                Some(Outcome::Correct { action }) => Some(Job::Correct { action: action.to_string(), family: family.id.clone() }),
                None => None,
            };
            if let (Some(job), Some(tx)) = (job, self.jobs.lock().unwrap().as_ref()) {
                let _ = tx.send(job);
            }
        }
        decision
    }

    fn handle(&self, job: Job) {
        let lib = library::get();
        let day = store::today();
        match job {
            Job::Correct { action, family } => {
                let _ = self.store.lock().unwrap().record(&family, &action, Kind::MacCorrect, &day);
            }
            Job::Habit { rule_id, family, app, blocked, translated } => {
                let Some(rule) = lib.habit_rules.iter().find(|r| r.id == rule_id) else { return };
                let mastered = {
                    let store = self.store.lock().unwrap();
                    let was = store
                        .progress(&day)
                        .ok()
                        .and_then(|p| p.into_iter().find(|p| p.action_id == rule.action))
                        .is_some_and(|p| p.mastered);
                    let _ = store.record(&family, &rule.action, Kind::HabitMiss, &day);
                    was
                };
                let spec = toast_for(rule, &app, blocked, translated, mastered);
                {
                    let mut recent = self.recent.lock().unwrap();
                    recent.push_front(RecentHint {
                        from: spec.from.clone(),
                        to: spec.to.clone(),
                        label: lib.action(&rule.action).map(|a| a.label.clone()).unwrap_or_default(),
                        guarded: blocked && rule.guard,
                    });
                    recent.truncate(5);
                }
                let muted = self.settings.read().unwrap().muted_families.iter().any(|f| *f == family);
                if !muted || spec.style == ToastStyle::Guard {
                    if let Some(show) = self.toast.get() {
                        show(spec);
                    }
                }
            }
        }
        self.notify();
    }

    pub fn notify(&self) {
        if let Some(f) = self.changed.get() {
            f();
        }
    }

    pub fn show_toast(&self, spec: ToastSpec) {
        if let Some(show) = self.toast.get() {
            show(spec);
        }
    }
}

pub fn toast_for(
    rule: &library::HabitRule,
    app: &str,
    blocked: bool,
    translated: bool,
    mastered: bool,
) -> ToastSpec {
    let lib = library::get();
    let label = lib.action(&rule.action).map(|a| a.label.as_str()).unwrap_or("");
    let mac = format_mac(&rule.mac[0]);
    let extra_keys = rule.mac[0].split('+').count().saturating_sub(2) as u64;
    if blocked && rule.guard {
        let what = if rule.arrives.ends_with("+q") { format!("would quit {app}") } else { format!("in {app}") };
        let pressed = format_mac(&rule.arrives.replace("rcmd", "cmd").replace("lcmd", "cmd"));
        return ToastSpec {
            from: format!("Blocked {pressed}"),
            to: what,
            detail: format!("For {label} press {mac}"),
            style: ToastStyle::Guard,
            duration_ms: 3500 + 1000 * extra_keys,
        };
    }
    let detail = if translated {
        format!("{label} · sent {mac} for you")
    } else if blocked {
        format!("{label} · now press {mac}")
    } else {
        label.to_string()
    };
    ToastSpec {
        from: format_windows(&rule.windows),
        to: mac,
        detail,
        style: if mastered { ToastStyle::Quiet } else { ToastStyle::Hint },
        duration_ms: if mastered { 1500 } else { 2500 + 1000 * extra_keys },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chord::Mods;

    fn engine() -> &'static Engine {
        let e: &'static Engine = Box::leak(Box::new(Engine::new(Store::in_memory().unwrap())));
        *e.detected_layout.write().unwrap() = (Layout::At, "com.apple.keylayout.Austrian".into());
        e
    }

    const RCMD: Mods = Mods { ctrl: false, shift: false, lopt: false, ropt: false, lcmd: false, rcmd: true };
    const LCMD: Mods = Mods { ctrl: false, shift: false, lopt: false, ropt: false, lcmd: true, rcmd: false };
    const CTRL: Mods = Mods { ctrl: true, shift: false, lopt: false, ropt: false, lcmd: false, rcmd: false };

    #[test]
    fn guard_blocks_right_cmd_q_only() {
        let e = engine();
        let q = |mods| Chord { mods, key: "q".into() };
        assert_eq!(e.on_key(&q(RCMD), "com.tinyspeck.slackmacgap", "Slack", false), Decision::Block);
        assert_eq!(e.on_key(&q(LCMD), "com.tinyspeck.slackmacgap", "Slack", false), Decision::Pass);
        let mut s = e.settings.read().unwrap().clone();
        s.guard = false;
        e.save_settings(s);
        assert_eq!(e.on_key(&q(RCMD), "com.tinyspeck.slackmacgap", "Slack", false), Decision::Pass);
    }

    #[test]
    fn habits_pass_through_in_toast_mode() {
        let e = engine();
        let c = Chord { mods: CTRL, key: "c".into() };
        assert_eq!(e.on_key(&c, "com.google.Chrome", "Chrome", false), Decision::Pass);
    }

    #[test]
    fn translate_mode_replaces_with_the_mac_chord() {
        let e = engine();
        let mut s = e.settings.read().unwrap().clone();
        s.mode = Mode::Translate;
        e.save_settings(s);
        let c = Chord { mods: CTRL, key: "c".into() };
        assert_eq!(e.on_key(&c, "com.google.Chrome", "Chrome", false), Decision::Replace(Pattern::parse("cmd+c").unwrap()));
    }

    #[test]
    fn paused_means_nothing_happens() {
        let e = engine();
        let mut s = e.settings.read().unwrap().clone();
        s.paused_until = Some(now() + 3600);
        e.save_settings(s);
        let q = Chord { mods: RCMD, key: "q".into() };
        assert_eq!(e.on_key(&q, "com.tinyspeck.slackmacgap", "Slack", false), Decision::Pass);
    }

    #[test]
    fn guard_toast_says_what_was_prevented() {
        let lib = library::get();
        let r = lib.habit_rules.iter().find(|r| r.id == "at-sign:at:apple").unwrap();
        let t = toast_for(r, "Slack", true, false, false);
        assert_eq!(t.from, "Blocked ⌘Q");
        assert_eq!(t.to, "would quit Slack");
        assert_eq!(t.detail, "For @ press ⌥L");
        assert_eq!(t.style, ToastStyle::Guard);
    }

    #[test]
    fn hint_toast_reads_in_order() {
        let lib = library::get();
        let r = lib.habit_rules.iter().find(|r| r.id == "copy:us:apple").unwrap();
        let t = toast_for(r, "Chrome", false, false, false);
        assert_eq!((t.from.as_str(), t.to.as_str(), t.detail.as_str()), ("Ctrl+C", "⌘C", "Copy"));
        assert_eq!(t.duration_ms, 2500);
    }
}
