//! Local SQLite store. Holds counters of library actions, per-day totals, settings and the
//! per-app deliberate-use evidence (#31, local only). Nothing else.
//!
//! Invariant 5: no timestamps finer than a day, no chords, no text, no window titles.
//! `counter` rows are what sync (later) sends; `daily` never leaves the device (D9).

use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::Path;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    HabitMiss,
    MacCorrect,
    /// Windows recorder (#17): a library shortcut pressed on Windows.
    #[allow(dead_code)]
    WinUse,
}

/// Which side this build records for; also the device id prefix.
pub const PLATFORM: &str = if cfg!(windows) { "win" } else { "mac" };

impl Kind {
    pub fn id(self) -> &'static str {
        match self {
            Kind::HabitMiss => "habit_miss",
            Kind::MacCorrect => "mac_correct",
            Kind::WinUse => "win_use",
        }
    }
}

pub struct Store {
    conn: Connection,
    pub device_id: String,
}

#[derive(Serialize, Debug, Clone)]
pub struct CounterRow {
    pub device_id: String,
    pub platform: String,
    pub app_family: String,
    pub action_id: String,
    pub kind: String,
    pub count: i64,
    pub first_seen_day: String,
    pub last_seen_day: String,
}

#[derive(Serialize, Debug, Clone)]
pub struct DailyRow {
    pub day: String,
    pub app_family: String,
    pub kind: String,
    pub count: i64,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct ActionProgress {
    pub action_id: String,
    pub misses: i64,
    pub correct: i64,
    pub last_miss_day: Option<String>,
    pub mastered: bool,
    /// How often the Windows shortcut was pressed on synced Windows computers (#17).
    pub win_uses: i64,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceRow {
    pub habit: String,
    pub bundle_id: String,
    pub uses: i64,
    pub days: i64,
    pub last_day: String,
}

/// #31: ask "keep it?" after this many deliberate uses, on at least ASK_DAYS days; then every
/// ASK_AGAIN more uses after "Not now" or no answer.
pub const ASK_FIRST: i64 = 5;
pub const ASK_DAYS: i64 = 2;
pub const ASK_AGAIN: i64 = 20;

/// D12: mastered = at least 10 correct uses and no miss in the last 14 days.
pub fn is_mastered(correct: i64, last_miss_day: Option<&str>, today: &str) -> bool {
    if correct < 10 {
        return false;
    }
    match last_miss_day {
        None => true,
        Some(d) => days_between(d, today) >= 14,
    }
}

fn days_between(a: &str, b: &str) -> i64 {
    let p = |s: &str| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok();
    match (p(a), p(b)) {
        (Some(a), Some(b)) => (b - a).num_days(),
        _ => 0,
    }
}

pub fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

impl Store {
    pub fn open(path: &Path) -> rusqlite::Result<Store> {
        Self::init(Connection::open(path)?)
    }

    #[cfg(test)]
    pub fn in_memory() -> rusqlite::Result<Store> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(conn: Connection) -> rusqlite::Result<Store> {
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             CREATE TABLE IF NOT EXISTS counter (
               device_id TEXT NOT NULL, platform TEXT NOT NULL, app_family TEXT NOT NULL,
               action_id TEXT NOT NULL, kind TEXT NOT NULL, count INTEGER NOT NULL,
               first_seen_day TEXT NOT NULL, last_seen_day TEXT NOT NULL,
               PRIMARY KEY (device_id, platform, app_family, action_id, kind));
             CREATE TABLE IF NOT EXISTS daily (
               day TEXT NOT NULL, app_family TEXT NOT NULL, kind TEXT NOT NULL, count INTEGER NOT NULL,
               PRIMARY KEY (day, app_family, kind));
             CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             CREATE TABLE IF NOT EXISTS evidence (
               habit TEXT NOT NULL, bundle_id TEXT NOT NULL, uses INTEGER NOT NULL, days INTEGER NOT NULL,
               last_day TEXT NOT NULL, ask_at INTEGER NOT NULL,
               PRIMARY KEY (habit, bundle_id));",
        )?;
        let device_id = match conn.query_row("SELECT value FROM settings WHERE key='device_id'", [], |r| r.get(0)) {
            Ok(id) => id,
            Err(_) => {
                let id = new_device_id();
                conn.execute("INSERT INTO settings(key, value) VALUES ('device_id', ?1)", params![id])?;
                id
            }
        };
        Ok(Store { conn, device_id })
    }

    /// The only write path for key events: +1 on a library action counter and on the day's total.
    pub fn record(&self, family: &str, action_id: &str, kind: Kind, day: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO counter VALUES (?1, ?6, ?2, ?3, ?4, 1, ?5, ?5)
             ON CONFLICT(device_id, platform, app_family, action_id, kind)
             DO UPDATE SET count = count + 1, last_seen_day = ?5",
            params![self.device_id, family, action_id, kind.id(), day, PLATFORM],
        )?;
        self.conn.execute(
            "INSERT INTO daily VALUES (?1, ?2, ?3, 1)
             ON CONFLICT(day, app_family, kind) DO UPDATE SET count = count + 1",
            params![day, family, kind.id()],
        )?;
        Ok(())
    }

    pub fn counters(&self) -> rusqlite::Result<Vec<CounterRow>> {
        let mut st = self.conn.prepare("SELECT * FROM counter ORDER BY count DESC")?;
        let rows = st.query_map([], |r| {
            Ok(CounterRow {
                device_id: r.get(0)?,
                platform: r.get(1)?,
                app_family: r.get(2)?,
                action_id: r.get(3)?,
                kind: r.get(4)?,
                count: r.get(5)?,
                first_seen_day: r.get(6)?,
                last_seen_day: r.get(7)?,
            })
        })?;
        rows.collect()
    }

    pub fn daily(&self) -> rusqlite::Result<Vec<DailyRow>> {
        let mut st = self.conn.prepare("SELECT * FROM daily ORDER BY day")?;
        let rows = st.query_map([], |r| {
            Ok(DailyRow { day: r.get(0)?, app_family: r.get(1)?, kind: r.get(2)?, count: r.get(3)? })
        })?;
        rows.collect()
    }

    /// Per action, across app families.
    pub fn progress(&self, today: &str) -> rusqlite::Result<Vec<ActionProgress>> {
        let mut st = self.conn.prepare(
            "SELECT action_id,
               SUM(CASE WHEN kind='habit_miss' THEN count ELSE 0 END),
               SUM(CASE WHEN kind='mac_correct' THEN count ELSE 0 END),
               MAX(CASE WHEN kind='habit_miss' THEN last_seen_day END),
               SUM(CASE WHEN kind='win_use' THEN count ELSE 0 END)
             FROM counter GROUP BY action_id",
        )?;
        let rows = st.query_map([], |r| {
            let correct: i64 = r.get(2)?;
            let last: Option<String> = r.get(3)?;
            Ok(ActionProgress {
                action_id: r.get(0)?,
                misses: r.get(1)?,
                correct,
                mastered: is_mastered(correct, last.as_deref(), today),
                last_miss_day: last,
                win_uses: r.get(4)?,
            })
        })?;
        rows.collect()
    }

    pub fn setting(&self, key: &str) -> Option<String> {
        self.conn.query_row("SELECT value FROM settings WHERE key=?1", params![key], |r| r.get(0)).ok()
    }

    pub fn remove_setting(&self, key: &str) -> rusqlite::Result<()> {
        self.conn.execute("DELETE FROM settings WHERE key = ?1", params![key])?;
        Ok(())
    }

    pub fn set_setting(&self, key: &str, value: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO settings VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2",
            params![key, value],
        )?;
        Ok(())
    }

    /// This device's counter rows, the only rows it ever writes to a sync or export file.
    pub fn own_rows(&self) -> rusqlite::Result<Vec<crate::sync::FileRow>> {
        let mut st = self.conn.prepare(
            "SELECT app_family, action_id, kind, count, first_seen_day, last_seen_day
             FROM counter WHERE device_id = ?1 ORDER BY app_family, action_id, kind",
        )?;
        let rows = st.query_map(params![self.device_id], |r| {
            Ok(crate::sync::FileRow {
                app_family: r.get(0)?,
                action_id: r.get(1)?,
                kind: r.get(2)?,
                count: r.get(3)?,
                first_seen_day: r.get(4)?,
                last_seen_day: r.get(5)?,
            })
        })?;
        rows.collect()
    }

    /// Replaces every row of another device with the rows from its file. Never touches this
    /// device's own rows, so a sync or import can not double-count or overwrite local progress.
    pub fn replace_device(&self, device_id: &str, platform: &str, rows: &[crate::sync::FileRow]) -> rusqlite::Result<()> {
        if device_id == self.device_id {
            return Err(rusqlite::Error::InvalidParameterName("own device id".into()));
        }
        let tx = self.conn.unchecked_transaction()?;
        tx.execute("DELETE FROM counter WHERE device_id = ?1", params![device_id])?;
        {
            let mut ins = tx.prepare("INSERT INTO counter VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")?;
            for r in rows {
                ins.execute(params![
                    device_id,
                    platform,
                    r.app_family,
                    r.action_id,
                    r.kind,
                    r.count,
                    r.first_seen_day,
                    r.last_seen_day
                ])?;
            }
        }
        tx.commit()
    }

    /// Other devices whose rows are in the database, with their row count.
    pub fn other_devices(&self) -> rusqlite::Result<Vec<(String, i64)>> {
        let mut st = self.conn.prepare(
            "SELECT device_id, COUNT(*) FROM counter WHERE device_id != ?1 GROUP BY device_id ORDER BY device_id",
        )?;
        let rows = st.query_map(params![self.device_id], |r| Ok((r.get(0)?, r.get(1)?)))?;
        rows.collect()
    }

    pub fn forget_other_devices(&self) -> rusqlite::Result<()> {
        self.conn.execute("DELETE FROM counter WHERE device_id != ?1", params![self.device_id])?;
        Ok(())
    }

    pub fn reset_counts(&self) -> rusqlite::Result<()> {
        self.conn.execute_batch("DELETE FROM counter; DELETE FROM daily; DELETE FROM evidence;")
    }

    /// #31: a Windows shortcut used in this app and not followed by the Mac way. Counts uses and the
    /// distinct days they happened on (day granularity only, invariant 5). Never synced.
    pub fn record_deliberate(&self, habit: &str, bundle_id: &str, day: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO evidence VALUES (?1, ?2, 1, 1, ?3, ?4)
             ON CONFLICT(habit, bundle_id) DO UPDATE SET uses = uses + 1,
               days = days + (last_day != ?3), last_day = ?3",
            params![habit, bundle_id, day, ASK_FIRST],
        )?;
        Ok(())
    }

    /// #31: is it time to ask whether this shortcut is meant? If so, the next question waits for
    /// ASK_AGAIN more uses, whatever the answer (Keep ends the hints anyway).
    pub fn should_ask(&self, habit: &str, bundle_id: &str) -> rusqlite::Result<bool> {
        let row: Option<(i64, i64, i64)> = self
            .conn
            .query_row("SELECT uses, days, ask_at FROM evidence WHERE habit=?1 AND bundle_id=?2", params![habit, bundle_id], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })
            .ok();
        let Some((uses, days, ask_at)) = row else { return Ok(false) };
        if uses < ask_at || days < ASK_DAYS {
            return Ok(false);
        }
        self.conn.execute(
            "UPDATE evidence SET ask_at = ?3 WHERE habit=?1 AND bundle_id=?2",
            params![habit, bundle_id, uses + ASK_AGAIN],
        )?;
        Ok(true)
    }

    /// The evidence rows, for the "what is stored" screen.
    pub fn evidence(&self) -> rusqlite::Result<Vec<EvidenceRow>> {
        let mut st = self.conn.prepare("SELECT habit, bundle_id, uses, days, last_day FROM evidence ORDER BY habit, bundle_id")?;
        let rows = st.query_map([], |r| {
            Ok(EvidenceRow { habit: r.get(0)?, bundle_id: r.get(1)?, uses: r.get(2)?, days: r.get(3)?, last_day: r.get(4)? })
        })?;
        rows.collect()
    }

    /// Every column of every table, for the "what is stored" screen and the privacy test.
    pub fn columns(&self) -> rusqlite::Result<Vec<(String, Vec<String>)>> {
        let mut out = vec![];
        for t in ["counter", "daily", "settings", "evidence"] {
            let mut st = self.conn.prepare(&format!("PRAGMA table_info({t})"))?;
            let cols = st.query_map([], |r| r.get::<_, String>(1))?.collect::<Result<Vec<_>, _>>()?;
            out.push((t.to_string(), cols));
        }
        Ok(out)
    }
}

fn new_device_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let pid = std::process::id() as u128;
    format!("{PLATFORM}-{:016x}", (nanos ^ (pid << 64)) as u64 ^ (nanos >> 64) as u64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chord::{Chord, Mods};
    use crate::filter::{is_key_combo, Held};
    use crate::keymap::{self, Layout};
    use crate::library::{self, Keyboard};
    use crate::matcher::{self, Context, Exclusion, Outcome};

    #[test]
    fn mastered_rule() {
        assert!(!is_mastered(9, None, "2026-11-06"));
        assert!(is_mastered(10, None, "2026-11-06"));
        assert!(!is_mastered(30, Some("2026-11-01"), "2026-11-06"));
        assert!(is_mastered(30, Some("2026-10-20"), "2026-11-06"));
    }

    /// docs/setup/09: after a scripted session of typed text + shortcuts, the database
    /// contains only counter rows of library actions.
    #[test]
    fn scripted_session_stores_only_library_counters() {
        let store = Store::in_memory().unwrap();
        let lib = library::get();
        let ctx = Context { layout: Layout::De, keyboard: Keyboard::Apple, family: "chat", exclusion: Exclusion::None };
        let none = Mods::default();
        let ctrl = Mods { ctrl: true, ..none };
        let lcmd = Mods { lcmd: true, ..none };
        let shift = Mods { shift: true, ..none };
        // "Hallo Welt" typed, then Ctrl+C (habit), ⌘V (correct), Shift+A, ⌘K (no library action), Return.
        let session: Vec<(Mods, u16)> = "hallowelt"
            .chars()
            .filter_map(|ch| keymap::keycode(&ch.to_string(), Layout::De).map(|k| (none, k)))
            .chain([(none, 49), (ctrl, 8), (lcmd, 9), (shift, 0), (lcmd, 40), (none, 36)])
            .collect();
        for (mods, key) in session {
            let held = Held { cmd: mods.cmd(), ctrl: mods.ctrl, opt: mods.opt(), shift: mods.shift };
            if !is_key_combo(held, key) {
                continue;
            }
            let chord = Chord { mods, key: keymap::label(key, Layout::De).unwrap().into() };
            match matcher::evaluate(lib, &ctx, &chord) {
                Some(Outcome::Habit(r)) => store.record("chat", &r.action, Kind::HabitMiss, "2026-11-06").unwrap(),
                Some(Outcome::Correct { action }) => store.record("chat", action, Kind::MacCorrect, "2026-11-06").unwrap(),
                None => {}
            }
        }
        let rows = store.counters().unwrap();
        assert_eq!(rows.len(), 2, "{rows:?}");
        for r in &rows {
            assert!(lib.action(&r.action_id).is_some(), "{} is not a library action", r.action_id);
        }
        // The schema itself has no place for text, chords, titles or timestamps.
        let cols = store.columns().unwrap();
        assert_eq!(
            cols[0].1,
            ["device_id", "platform", "app_family", "action_id", "kind", "count", "first_seen_day", "last_seen_day"]
        );
        assert_eq!(cols[1].1, ["day", "app_family", "kind", "count"]);
        assert_eq!(cols[3].1, ["habit", "bundle_id", "uses", "days", "last_day", "ask_at"]);
    }

    #[test]
    fn asks_after_five_uses_on_two_days_then_every_twenty() {
        let s = Store::in_memory().unwrap();
        let app = "com.apple.Terminal";
        for _ in 0..6 {
            s.record_deliberate("copy", app, "2026-11-06").unwrap();
        }
        assert!(!s.should_ask("copy", app).unwrap(), "one day is not enough");
        s.record_deliberate("copy", app, "2026-11-07").unwrap();
        assert!(s.should_ask("copy", app).unwrap());
        assert!(!s.should_ask("copy", app).unwrap(), "asked once, not again at once");
        for _ in 0..19 {
            s.record_deliberate("copy", app, "2026-11-07").unwrap();
        }
        assert!(!s.should_ask("copy", app).unwrap());
        s.record_deliberate("copy", app, "2026-11-08").unwrap();
        assert!(s.should_ask("copy", app).unwrap());
        // Another app has its own evidence.
        assert!(!s.should_ask("copy", "com.google.Chrome").unwrap());
        let ev = s.evidence().unwrap();
        assert_eq!((ev[0].uses, ev[0].days), (27, 3));
        s.reset_counts().unwrap();
        assert!(s.evidence().unwrap().is_empty());
    }
}
