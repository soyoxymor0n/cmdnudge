//! Glue between the platform capture layer and the core: decides what happens to a key press
//! (pass, block, replace), and hands counting + toasts to a worker thread so the event tap
//! callback stays fast.

use crate::chord::{format_mac, format_pressed, format_windows, Chord, Pattern};
use crate::keymap::Layout;
use crate::library::{self, Keyboard};
use crate::matcher::{self, Context, Exclusion, Outcome};
use crate::settings::{Kept, Mode, Settings};
use crate::store::{self, Kind, Store};
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::mpsc::{channel, Sender};
use std::sync::{Mutex, OnceLock, RwLock};
use std::time::{Duration, Instant};

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
    /// Habit hints offer "Keep" (#29); guards and tips don't.
    pub keep: Option<KeepOffer>,
}

/// What a "Keep" click on a hint (toast or menu bar) refers to (#29).
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeepOffer {
    pub habit: String,
    pub bundle_id: String,
    pub app_name: String,
    pub shortcut: String,
    pub label: String,
    /// #31: the evidence says this use is deliberate; the hint asks "Keep it?" right away.
    pub ask: bool,
}

/// #31: a hinted Windows shortcut waiting to see whether the Mac way follows within FOLLOW.
struct Pending {
    habit: String,
    action: String,
    bundle_id: String,
    at: Instant,
}

/// The Mac way within this time after a hint means the Windows shortcut was a slip, not a choice.
const FOLLOW: Duration = Duration::from_secs(10);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentHint {
    pub from: String,
    pub to: String,
    pub label: String,
    pub guarded: bool,
    /// None for guards: a guarded chord can't be kept.
    pub keep: Option<KeepOffer>,
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
    Habit {
        rule_id: String,
        family: String,
        bundle_id: String,
        app: String,
        blocked: bool,
        translated: bool,
        /// Ask Accessibility whether the focus is in an editor's built-in terminal first (#30).
        check_terminal: bool,
    },
    Correct { action: String, family: String, bundle_id: String },
}

pub struct Engine {
    pub store: Mutex<Store>,
    pub settings: RwLock<Settings>,
    pub detected_layout: RwLock<(Layout, String)>,
    pub recent: Mutex<VecDeque<RecentHint>>,
    pub key_check: Mutex<Option<KeyCheck>>,
    jobs: Mutex<Option<Sender<Job>>>,
    pending: Mutex<Vec<Pending>>,
    toast: OnceLock<Box<dyn Fn(ToastSpec) + Send + Sync>>,
    terminal_probe: OnceLock<Box<dyn Fn() -> bool + Send + Sync>>,
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
            pending: Mutex::new(Vec::new()),
            toast: OnceLock::new(),
            terminal_probe: OnceLock::new(),
            changed: OnceLock::new(),
        }
    }

    pub fn on_toast(&self, f: impl Fn(ToastSpec) + Send + Sync + 'static) {
        let _ = self.toast.set(Box::new(f));
    }

    /// #30: says whether the keyboard focus is in a built-in terminal (xterm.js in VS Code, Cursor,
    /// …). Platform code sets it; without it nothing counts as a terminal.
    pub fn on_terminal_probe(&self, f: impl Fn() -> bool + Send + Sync + 'static) {
        let _ = self.terminal_probe.set(Box::new(f));
    }

    fn in_terminal(&self) -> bool {
        self.terminal_probe.get().is_some_and(|f| f())
    }

    /// Keep a shortcut on purpose (#29), in the hint's app or everywhere.
    pub fn keep(&self, offer: &KeepOffer, everywhere: bool) {
        let mut s = self.settings.read().unwrap().clone();
        s.keep(Kept {
            habit: offer.habit.clone(),
            app: if everywhere { None } else { Some(offer.bundle_id.clone()) },
            app_name: if everywhere { String::new() } else { offer.app_name.clone() },
            shortcut: offer.shortcut.clone(),
            label: offer.label.clone(),
        });
        self.save_settings(s);
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

    /// Windows recorder (#17): one press of a library Windows shortcut in an app of this family.
    /// Nothing while paused or for a family excluded from counting. Runs on the recorder's
    /// worker thread, never in the hook.
    #[allow(dead_code)]
    pub fn record_win_use(&self, family: &str, action: &str) -> bool {
        let settings = self.settings.read().unwrap().clone();
        if settings.is_paused(now()) || self.exclusion(family, &settings) == Exclusion::All {
            return false;
        }
        let ok = self.store.lock().unwrap().record(family, action, Kind::WinUse, &store::today()).is_ok();
        if ok {
            self.notify();
        }
        ok
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
        let mut outcome = matcher::evaluate(lib, &ctx, chord);
        let mut note = None;
        // #29: a shortcut kept on purpose is neither hinted, counted nor changed. Guards stay.
        if let Some(Outcome::Habit(r)) = &outcome {
            if !r.guard && settings.is_kept(&r.habit, bundle_id) {
                note = Some(format!("kept on purpose: {}", format_windows(&r.windows)));
                outcome = None;
            }
        }
        // #30: in an editor's built-in terminal Ctrl habits are right, as in a terminal app (and the
        // "Quiet in Terminal" switch covers both). Only typing habits and guards stay.
        let terminal_rules = matches!(&outcome, Some(Outcome::Habit(r))
            if ctx.exclusion == Exclusion::None && r.category != "typing" && !r.guard
                && self.exclusion("terminal", &settings) != Exclusion::None);
        // Hint-only mode lets the key through anyway, so the worker asks; the other modes decide
        // here whether to change the key.
        let check_terminal = terminal_rules && settings.mode == Mode::Toast;
        if terminal_rules && !check_terminal && self.in_terminal() {
            note = Some("a terminal: Ctrl keys are right here".to_string());
            outcome = None;
        }
        *self.key_check.lock().unwrap() = Some(KeyCheck {
            pressed: format_pressed(chord),
            family: family.label.clone(),
            meaning: match &outcome {
                Some(Outcome::Habit(r)) => Some(format!("habit {} → {}", format_windows(&r.windows), format_mac(&r.mac[0]))),
                Some(Outcome::Correct { action }) => lib.action(action).map(|a| format!("the Mac way: {}", a.label)),
                None => note,
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
                    bundle_id: bundle_id.to_string(),
                    app: app_name.to_string(),
                    blocked: decision == Decision::Block,
                    translated: matches!(decision, Decision::Replace(_)),
                    check_terminal,
                }),
                Some(Outcome::Correct { action }) => Some(Job::Correct {
                    action: action.to_string(),
                    family: family.id.clone(),
                    bundle_id: bundle_id.to_string(),
                }),
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
        self.settle(Instant::now(), &day);
        match job {
            Job::Correct { action, family, bundle_id } => {
                self.followed(&action, &bundle_id);
                let _ = self.store.lock().unwrap().record(&family, &action, Kind::MacCorrect, &day);
            }
            Job::Habit { rule_id, family, bundle_id, app, blocked, translated, check_terminal } => {
                let Some(rule) = lib.habit_rules.iter().find(|r| r.id == rule_id) else { return };
                if check_terminal && self.in_terminal() {
                    return;
                }
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
                let mut spec = toast_for(rule, &app, blocked, translated, mastered);
                if spec.style != ToastStyle::Guard {
                    spec.keep = Some(KeepOffer {
                        habit: rule.habit.clone(),
                        bundle_id,
                        app_name: app.clone(),
                        shortcut: spec.from.clone(),
                        label: lib.action(&rule.action).map(|a| a.label.clone()).unwrap_or_default(),
                        ask: false,
                    });
                }
                {
                    let mut recent = self.recent.lock().unwrap();
                    recent.push_front(RecentHint {
                        from: spec.from.clone(),
                        to: spec.to.clone(),
                        label: lib.action(&rule.action).map(|a| a.label.clone()).unwrap_or_default(),
                        guarded: blocked && rule.guard,
                        keep: spec.keep.clone(),
                    });
                    recent.truncate(5);
                }
                let muted = self.settings.read().unwrap().muted_families.iter().any(|f| *f == family);
                if let Some(offer) = spec.keep.as_mut() {
                    // #31: the question rides on this hint, never on a toast of its own.
                    if !muted && self.store.lock().unwrap().should_ask(&offer.habit, &offer.bundle_id).unwrap_or(false) {
                        offer.ask = true;
                        spec.detail = format!("{} · looks deliberate. Keep it?", offer.label);
                        spec.duration_ms += 5000;
                    }
                    self.pending.lock().unwrap().push(Pending {
                        habit: offer.habit.clone(),
                        action: rule.action.clone(),
                        bundle_id: offer.bundle_id.clone(),
                        at: Instant::now(),
                    });
                }
                if !muted || spec.style == ToastStyle::Guard {
                    if let Some(show) = self.toast.get() {
                        show(spec);
                    }
                }
            }
        }
        self.notify();
    }

    /// #31: hinted uses older than FOLLOW without the Mac way count as deliberate.
    fn settle(&self, now: Instant, day: &str) {
        let done: Vec<Pending> = {
            let mut p = self.pending.lock().unwrap();
            let (done, keep) = p.drain(..).partition(|p| now.duration_since(p.at) >= FOLLOW);
            *p = keep;
            done
        };
        if done.is_empty() {
            return;
        }
        let store = self.store.lock().unwrap();
        for p in done {
            let _ = store.record_deliberate(&p.habit, &p.bundle_id, day);
        }
    }

    /// #31: the Mac way came after the hint: those uses were slips.
    fn followed(&self, action: &str, bundle_id: &str) {
        self.pending.lock().unwrap().retain(|p| !(p.action == action && p.bundle_id == bundle_id));
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
            keep: None,
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
        keep: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chord::Mods;

    fn engine() -> &'static Engine {
        let e: &'static Engine = Box::leak(Box::new(Engine::new(Store::in_memory().unwrap())));
        *e.detected_layout.write().unwrap() = (Layout::De, "com.apple.keylayout.Austrian".into());
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
    fn windows_uses_count_unless_paused() {
        let e = engine();
        assert!(e.record_win_use("browser", "browser.tab.reopen"));
        assert!(e.record_win_use("system", "browser.tab.reopen"));
        // Remote desktops and VMs are excluded from counting (the keys belong to the other machine).
        assert!(!e.record_win_use("remote", "browser.tab.reopen"));
        let mut s = e.settings.read().unwrap().clone();
        s.paused_until = Some(now() + 3600);
        e.save_settings(s);
        assert!(!e.record_win_use("browser", "browser.tab.reopen"));
        let p = e.store.lock().unwrap().progress(&store::today()).unwrap();
        let row = p.iter().find(|p| p.action_id == "browser.tab.reopen").unwrap();
        assert_eq!((row.win_uses, row.misses), (2, 0));
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

    fn offer(habit: &str, bundle: &str) -> KeepOffer {
        KeepOffer { habit: habit.into(), bundle_id: bundle.into(), app_name: "Code".into(), shortcut: "Ctrl+C".into(), label: "Copy".into(), ask: false }
    }

    fn translate(e: &Engine) {
        let mut s = e.settings.read().unwrap().clone();
        s.mode = Mode::Translate;
        e.save_settings(s);
    }

    #[test]
    fn a_kept_shortcut_passes_unchanged_in_that_app_only() {
        let e = engine();
        translate(e);
        let c = Chord { mods: CTRL, key: "c".into() };
        e.keep(&offer("copy", "com.microsoft.VSCode"), false);
        assert_eq!(e.on_key(&c, "com.microsoft.VSCode", "Code", false), Decision::Pass);
        assert_eq!(e.on_key(&c, "com.google.Chrome", "Chrome", false), Decision::Replace(Pattern::parse("cmd+c").unwrap()));
        e.keep(&offer("copy", "com.microsoft.VSCode"), true);
        assert_eq!(e.on_key(&c, "com.google.Chrome", "Chrome", false), Decision::Pass);
        assert_eq!(e.settings.read().unwrap().kept.len(), 1);
    }

    #[test]
    fn keeping_never_switches_off_the_guard() {
        let e = engine();
        e.keep(&offer("at-sign", "com.tinyspeck.slackmacgap"), true);
        let q = Chord { mods: RCMD, key: "q".into() };
        assert_eq!(e.on_key(&q, "com.tinyspeck.slackmacgap", "Slack", false), Decision::Block);
    }

    #[test]
    fn a_kept_shortcut_is_not_counted_as_a_slip() {
        let e = engine();
        e.start_worker();
        e.keep(&offer("copy", "com.microsoft.VSCode"), false);
        let c = Chord { mods: CTRL, key: "c".into() };
        e.on_key(&c, "com.microsoft.VSCode", "Code", false);
        e.on_key(&c, "com.google.Chrome", "Chrome", false);
        std::thread::sleep(std::time::Duration::from_millis(200));
        let rows = e.store.lock().unwrap().counters().unwrap();
        let misses: Vec<_> = rows.iter().filter(|r| r.kind == "habit_miss").map(|r| r.app_family.as_str()).collect();
        assert_eq!(misses, vec!["browser"]);
    }

    #[test]
    fn editor_terminal_is_quiet_like_a_terminal_app() {
        let e = engine();
        e.on_terminal_probe(|| true);
        translate(e);
        let c = Chord { mods: CTRL, key: "c".into() };
        assert_eq!(e.on_key(&c, "com.microsoft.VSCode", "Code", false), Decision::Pass);
        // The typing guard still applies in a terminal.
        assert_eq!(e.on_key(&Chord { mods: RCMD, key: "q".into() }, "com.microsoft.VSCode", "Code", false), Decision::Block);
        // "Quiet in Terminal" switched off: hints come back, in editor terminals too.
        let mut s = e.settings.read().unwrap().clone();
        s.include_families = vec!["terminal".into()];
        e.save_settings(s);
        assert_eq!(e.on_key(&c, "com.microsoft.VSCode", "Code", false), Decision::Replace(Pattern::parse("cmd+c").unwrap()));
    }

    #[test]
    fn editor_terminal_check_in_hint_mode_drops_the_slip() {
        let e = engine();
        e.on_terminal_probe(|| true);
        e.start_worker();
        let c = Chord { mods: CTRL, key: "c".into() };
        assert_eq!(e.on_key(&c, "com.microsoft.VSCode", "Code", false), Decision::Pass);
        std::thread::sleep(std::time::Duration::from_millis(200));
        assert!(e.store.lock().unwrap().counters().unwrap().iter().all(|r| r.kind != "habit_miss"));
        assert!(e.recent.lock().unwrap().is_empty());
    }

    #[test]
    fn outside_a_terminal_editors_still_hint() {
        let e = engine();
        e.on_terminal_probe(|| false);
        translate(e);
        let c = Chord { mods: CTRL, key: "c".into() };
        assert_eq!(e.on_key(&c, "com.microsoft.VSCode", "Code", false), Decision::Replace(Pattern::parse("cmd+c").unwrap()));
    }

    /// Waits until the worker has handled everything sent so far.
    fn drain(e: &Engine) {
        std::thread::sleep(std::time::Duration::from_millis(150));
        let _ = e;
    }

    fn age_pending(e: &Engine) {
        for p in e.pending.lock().unwrap().iter_mut() {
            p.at -= FOLLOW;
        }
    }

    #[test]
    fn a_slip_followed_by_the_mac_way_is_not_evidence() {
        let e = engine();
        e.start_worker();
        let c = Chord { mods: CTRL, key: "c".into() };
        e.on_key(&c, "com.google.Chrome", "Chrome", false);
        e.on_key(&Chord { mods: LCMD, key: "c".into() }, "com.google.Chrome", "Chrome", false);
        drain(e);
        assert!(e.pending.lock().unwrap().is_empty());
        e.settle(Instant::now(), "2026-11-07");
        assert!(e.store.lock().unwrap().evidence().unwrap().is_empty());
    }

    #[test]
    fn the_mac_way_in_another_app_does_not_cancel_the_evidence() {
        let e = engine();
        e.start_worker();
        e.on_key(&Chord { mods: CTRL, key: "c".into() }, "com.google.Chrome", "Chrome", false);
        e.on_key(&Chord { mods: LCMD, key: "c".into() }, "com.apple.Notes", "Notes", false);
        drain(e);
        age_pending(e);
        e.settle(Instant::now(), "2026-11-07");
        let ev = e.store.lock().unwrap().evidence().unwrap();
        assert_eq!((ev.len(), ev[0].bundle_id.as_str(), ev[0].uses), (1, "com.google.Chrome", 1));
    }

    #[test]
    fn deliberate_use_puts_the_question_into_the_hint() {
        let e = engine();
        let shown: &'static Mutex<Vec<ToastSpec>> = Box::leak(Box::new(Mutex::new(vec![])));
        e.on_toast(move |t| shown.lock().unwrap().push(t));
        {
            let s = e.store.lock().unwrap();
            for day in ["2026-11-05", "2026-11-05", "2026-11-06", "2026-11-06", "2026-11-06"] {
                s.record_deliberate("copy", "com.google.Chrome", day).unwrap();
            }
        }
        e.start_worker();
        let c = Chord { mods: CTRL, key: "c".into() };
        e.on_key(&c, "com.google.Chrome", "Chrome", false);
        e.on_key(&c, "com.google.Chrome", "Chrome", false);
        drain(e);
        let shown = shown.lock().unwrap();
        assert_eq!(shown.len(), 2, "no extra toast");
        let k = shown[0].keep.as_ref().unwrap();
        assert!(k.ask);
        assert_eq!(shown[0].detail, "Copy · looks deliberate. Keep it?");
        assert!(!shown[1].keep.as_ref().unwrap().ask, "asked once, then again after 20 more uses");
    }

    #[test]
    fn guard_toast_says_what_was_prevented() {
        let lib = library::get();
        let r = lib.habit_rules.iter().find(|r| r.id == "at-sign:de:apple").unwrap();
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
