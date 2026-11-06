//! The bundled shortcut library (packages/library/dist/library.json), parsed once.

use crate::chord::Pattern;
use crate::keymap::Layout;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

pub const LIBRARY_JSON: &str = include_str!("../../../../packages/library/dist/library.json");

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Keyboard {
    Apple,
    Pc,
}

#[derive(Deserialize, Clone, Debug)]
pub struct Action {
    pub id: String,
    pub label: String,
    pub category: String,
    #[allow(dead_code)]
    pub destructive: bool,
}

#[derive(Deserialize, Clone, Debug)]
pub struct AppFamily {
    pub id: String,
    pub label: String,
    pub mac: Vec<String>,
    #[serde(default)]
    pub exclude: Option<String>,
}

#[derive(Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HabitRule {
    pub id: String,
    pub habit: String,
    pub action: String,
    pub family: String,
    pub layout: Layout,
    pub keyboard: Keyboard,
    pub windows: String,
    pub arrives: String,
    pub mac: Vec<String>,
    pub guard: bool,
    pub category: String,
    #[serde(skip)]
    pub pattern: Option<Pattern>,
}

#[derive(Deserialize, Clone, Debug)]
pub struct MacWay {
    pub action: String,
    pub family: String,
    pub chord: String,
    pub layouts: Vec<Layout>,
    #[serde(skip)]
    pub pattern: Option<Pattern>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    pub actions: Vec<Action>,
    pub app_families: Vec<AppFamily>,
    pub habit_rules: Vec<HabitRule>,
    pub mac_ways: Vec<MacWay>,
}

impl Library {
    pub fn parse(json: &str) -> Library {
        let mut lib: Library = serde_json::from_str(json).expect("bundled library.json is valid");
        for r in &mut lib.habit_rules {
            r.pattern = Some(Pattern::parse(&r.arrives).expect("valid arrives chord"));
        }
        for w in &mut lib.mac_ways {
            w.pattern = Some(Pattern::parse(&w.chord).expect("valid mac chord"));
        }
        lib
    }

    pub fn action(&self, id: &str) -> Option<&Action> {
        self.actions.iter().find(|a| a.id == id)
    }

    /// Bundle id -> family id. Unknown apps belong to "system" (only universal habits apply).
    pub fn family_of(&self, bundle_id: &str) -> &AppFamily {
        self.app_families
            .iter()
            .find(|f| f.mac.iter().any(|b| b == bundle_id))
            .unwrap_or_else(|| self.family("system").expect("system family exists"))
    }

    pub fn family(&self, id: &str) -> Option<&AppFamily> {
        self.app_families.iter().find(|f| f.id == id)
    }
}

pub fn get() -> &'static Library {
    static LIB: OnceLock<Library> = OnceLock::new();
    LIB.get_or_init(|| Library::parse(LIBRARY_JSON))
}
