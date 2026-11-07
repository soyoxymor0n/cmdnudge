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

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub mode: Mode,
    /// Block habit-sourced destructive chords (right ⌘Q from AltGr+Q). On by default.
    pub guard: bool,
    /// "auto" | "apple" | "pc"
    pub keyboard: String,
    /// "auto" | "us" | "de" | "at"
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
    /// Tips for menu items picked with the mouse (#19). Experimental, off by default.
    pub menu_tips: bool,
    /// No toasts while the screen is being shared or recorded (#24); counting continues. On by default.
    pub quiet_while_sharing: bool,
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
            menu_tips: false,
            quiet_while_sharing: true,
        }
    }
}

impl Settings {
    pub fn is_paused(&self, now: i64) -> bool {
        self.paused_until.is_some_and(|t| t > now)
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
}
