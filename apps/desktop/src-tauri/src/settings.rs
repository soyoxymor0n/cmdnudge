//! User settings, stored as one JSON value in the `settings` table.

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    /// Default: show the Mac way, let the key through unchanged.
    Toast,
    /// Block the habit and send the Mac shortcut instead, plus the toast.
    Translate,
    /// Block the habit; only the toast happens. You have to press the Mac way yourself.
    Strict,
}

/// A Windows shortcut the user uses on purpose (#29): no hint and no slip for it, in one app or
/// everywhere. `shortcut` and `label` are only kept for the Settings list.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Kept {
    /// Habit id from the library ("copy"), the same across layouts and keyboards.
    pub habit: String,
    /// App bundle id; None = everywhere.
    pub app: Option<String>,
    pub app_name: String,
    pub shortcut: String,
    pub label: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub mode: Mode,
    /// Block habit-sourced destructive chords (right ⌘Q from AltGr+Q). On by default.
    pub guard: bool,
    /// "auto" | "apple" | "pc"
    pub keyboard: String,
    /// "auto" or a layout id from layouts.json ("at" is read as "de")
    pub layout: String,
    /// Unix seconds; None = running.
    pub paused_until: Option<i64>,
    /// Families excluded by default that the user switched back on.
    pub include_families: Vec<String>,
    /// Families where the user said "don't show hints here" (counting and the guard continue).
    pub muted_families: Vec<String>,
    /// "bottom-right" | "bottom-left" | "top-center"
    pub position: String,
    pub onboarded: bool,
    /// Shared folder for file sync (#16); None = off.
    pub sync_folder: Option<String>,
    /// Tips for menu items picked with the mouse (#19). On by default (owner, 2026-11-07).
    pub menu_tips: bool,
    /// No toasts while the screen is being shared or recorded (#24); counting continues. On by default.
    pub quiet_while_sharing: bool,
    /// Shortcuts kept on purpose (#29).
    pub kept: Vec<Kept>,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            mode: Mode::Toast,
            guard: true,
            keyboard: "auto".into(),
            layout: "auto".into(),
            paused_until: None,
            include_families: vec![],
            muted_families: vec![],
            position: "bottom-right".into(),
            onboarded: false,
            sync_folder: None,
            menu_tips: true,
            quiet_while_sharing: true,
            kept: vec![],
        }
    }
}

impl Settings {
    pub fn is_paused(&self, now: i64) -> bool {
        self.paused_until.is_some_and(|t| t > now)
    }

    /// Whether this habit is kept on purpose in this app (#29).
    pub fn is_kept(&self, habit: &str, bundle_id: &str) -> bool {
        self.kept.iter().any(|k| k.habit == habit && k.app.as_deref().is_none_or(|a| a == bundle_id))
    }

    /// Adds a kept shortcut. "Everywhere" replaces the app entries of the same habit; an app entry
    /// is not added when the habit is already kept everywhere or in that app.
    pub fn keep(&mut self, k: Kept) {
        if self.kept.iter().any(|x| x.habit == k.habit && (x.app.is_none() || x.app == k.app)) {
            return;
        }
        if k.app.is_none() {
            self.kept.retain(|x| x.habit != k.habit);
        }
        self.kept.push(k);
    }

    /// Whether a toast may appear now (#24): never while the screen is shared and the user kept
    /// "quiet while sharing" on. Counting and the guard are not affected.
    pub fn toasts_allowed(&self, screen_shared: bool) -> bool {
        !(self.quiet_while_sharing && screen_shared)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quiet_while_sharing_is_on_by_default_and_only_silences_toasts_when_shared() {
        // Settings saved before #24 have no such field: they get the default (on).
        let old: Settings = serde_json::from_str(r#"{"mode":"toast","menuTips":true}"#).unwrap();
        assert!(old.quiet_while_sharing);
        assert!(old.toasts_allowed(false));
        assert!(!old.toasts_allowed(true));
        let off = Settings { quiet_while_sharing: false, ..Settings::default() };
        assert!(off.toasts_allowed(true));
    }

    fn kept(habit: &str, app: Option<&str>) -> Kept {
        Kept { habit: habit.into(), app: app.map(Into::into), app_name: "Code".into(), shortcut: "Ctrl+C".into(), label: "Copy".into() }
    }

    #[test]
    fn keep_in_one_app_or_everywhere() {
        let mut s = Settings::default();
        assert!(!s.is_kept("copy", "com.microsoft.VSCode"));
        s.keep(kept("copy", Some("com.microsoft.VSCode")));
        s.keep(kept("copy", Some("com.microsoft.VSCode")));
        assert_eq!(s.kept.len(), 1);
        assert!(s.is_kept("copy", "com.microsoft.VSCode"));
        assert!(!s.is_kept("copy", "com.google.Chrome"));
        assert!(!s.is_kept("paste", "com.microsoft.VSCode"));
        s.keep(kept("copy", None));
        assert_eq!(s.kept, vec![kept("copy", None)]);
        assert!(s.is_kept("copy", "com.google.Chrome"));
        s.keep(kept("copy", Some("com.google.Chrome")));
        assert_eq!(s.kept.len(), 1);
        // Settings saved before #29 load with nothing kept.
        let old: Settings = serde_json::from_str(r#"{"mode":"toast"}"#).unwrap();
        assert!(old.kept.is_empty());
    }
}
