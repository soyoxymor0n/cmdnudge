//! Export / import and file sync (#16, decision D3).
//!
//! One JSON file per device holding only that device's counter rows. Totals are the sum across
//! devices, so nothing is ever merged into someone else's row and a sync can never double-count.
//! File sync: every device writes `<folder>/cmdnudge-sync/<device_id>.json` (temp file + rename)
//! and reads the others. Export / import moves the same file by hand.
//!
//! Everything read from disk is untrusted: the format, device id, kinds, days and counts are
//! checked, and a row only lands if its app family and action exist in the bundled library, so a
//! file can never put free text into the database (invariant 5).

use crate::store::Store;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const FORMAT: &str = "cmdnudge-counters/1";
pub const SUBDIR: &str = "cmdnudge-sync";
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_ROWS: usize = 20_000;
const MAX_FILES: usize = 64;
const MAX_COUNT: i64 = 100_000_000;
const KINDS: [&str; 4] = ["habit_miss", "mac_correct", "menu_by_mouse", "win_use"];

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct FileRow {
    pub app_family: String,
    pub action_id: String,
    pub kind: String,
    pub count: i64,
    pub first_seen_day: String,
    pub last_seen_day: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DeviceFile {
    pub format: String,
    pub device_id: String,
    pub platform: String,
    pub written_on: String,
    pub counters: Vec<FileRow>,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    /// Day of the run (no finer timestamps, invariant 5).
    pub day: String,
    /// Other devices whose rows are now in the local database.
    pub devices: usize,
    pub rows: usize,
    /// Rows skipped because their action or app family is unknown to this version.
    pub skipped_rows: usize,
    /// Files that could not be used, with the reason.
    pub problems: Vec<String>,
}

static LAST: Mutex<Option<Report>> = Mutex::new(None);

pub fn last_report() -> Option<Report> {
    LAST.lock().unwrap().clone()
}

fn set_last(r: &Report) {
    *LAST.lock().unwrap() = Some(r.clone());
}

fn valid_day(s: &str) -> bool {
    s.len() == 10 && chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").is_ok()
}

/// `mac-` or `win-` followed by 1-32 lowercase hex digits.
pub fn valid_device_id(s: &str) -> bool {
    let Some((p, hex)) = s.split_once('-') else { return false };
    matches!(p, "mac" | "win")
        && !hex.is_empty()
        && hex.len() <= 32
        && hex.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// Parses and checks a device file. `known(family, action)` says whether the library knows the
/// pair. Returns the file with only usable rows, plus how many rows were dropped.
pub fn parse(bytes: &[u8], known: &dyn Fn(&str, &str) -> bool) -> Result<(DeviceFile, usize), String> {
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err("file is larger than 2 MB".into());
    }
    let mut f: DeviceFile = serde_json::from_slice(bytes).map_err(|_| "not a cmdnudge counters file".to_string())?;
    if f.format != FORMAT {
        return Err(format!("unknown format {:?}", f.format.chars().take(40).collect::<String>()));
    }
    if !valid_device_id(&f.device_id) {
        return Err("invalid device id".into());
    }
    if !matches!(f.platform.as_str(), "mac" | "win") || !f.device_id.starts_with(&f.platform) {
        return Err("invalid platform".into());
    }
    if f.counters.len() > MAX_ROWS {
        return Err("too many rows".into());
    }
    let before = f.counters.len();
    f.counters.retain(|r| {
        KINDS.contains(&r.kind.as_str())
            && (0..=MAX_COUNT).contains(&r.count)
            && valid_day(&r.first_seen_day)
            && valid_day(&r.last_seen_day)
            && r.first_seen_day <= r.last_seen_day
            && known(&r.app_family, &r.action_id)
    });
    // One row per key; a duplicate would violate the primary key.
    let mut seen = std::collections::HashSet::new();
    f.counters.retain(|r| seen.insert((r.app_family.clone(), r.action_id.clone(), r.kind.clone())));
    let dropped = before - f.counters.len();
    Ok((f, dropped))
}

pub fn own_file(store: &Store, day: &str) -> rusqlite::Result<DeviceFile> {
    Ok(DeviceFile {
        format: FORMAT.into(),
        device_id: store.device_id.clone(),
        platform: "mac".into(),
        written_on: day.into(),
        counters: store.own_rows()?,
    })
}

fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let tmp = path.with_file_name(format!(".{name}.tmp"));
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)
}

/// Writes this device's rows to `path` (export).
pub fn export(store: &Store, path: &Path, day: &str) -> Result<(), String> {
    let f = own_file(store, day).map_err(|e| e.to_string())?;
    write_atomic(path, &serde_json::to_vec_pretty(&f).unwrap()).map_err(|e| e.to_string())
}

/// Reads one exported file and replaces that device's rows (import).
pub fn import(store: &Store, path: &Path, known: &dyn Fn(&str, &str) -> bool, day: &str) -> Result<Report, String> {
    let bytes = read_capped(path)?;
    let (f, skipped) = parse(&bytes, known)?;
    if f.device_id == store.device_id {
        return Err("This file comes from this Mac. Import it on your other computer.".into());
    }
    store.replace_device(&f.device_id, &f.platform, &f.counters).map_err(|e| e.to_string())?;
    Ok(Report { day: day.into(), devices: 1, rows: f.counters.len(), skipped_rows: skipped, problems: vec![] })
}

fn read_capped(path: &Path) -> Result<Vec<u8>, String> {
    let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("not a file".into());
    }
    if meta.len() > MAX_FILE_BYTES {
        return Err("file is larger than 2 MB".into());
    }
    std::fs::read(path).map_err(|e| e.to_string())
}

pub fn sync_dir(folder: &Path) -> PathBuf {
    folder.join(SUBDIR)
}

/// One file-sync round: write ours, read every other device's file.
pub fn sync_folder(store: &Store, folder: &Path, known: &dyn Fn(&str, &str) -> bool, day: &str) -> Result<Report, String> {
    if !folder.is_dir() {
        return Err("The sync folder is not reachable.".into());
    }
    let dir = sync_dir(folder);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let own = own_file(store, day).map_err(|e| e.to_string())?;
    write_atomic(&dir.join(format!("{}.json", own.device_id)), &serde_json::to_vec_pretty(&own).unwrap())
        .map_err(|e| e.to_string())?;

    let mut report = Report { day: day.into(), ..Default::default() };
    let mut entries: Vec<PathBuf> = std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x == "json"))
        .filter(|p| !p.file_name().is_some_and(|n| n.to_string_lossy().starts_with('.')))
        .collect();
    entries.sort();
    for path in entries.into_iter().take(MAX_FILES) {
        let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        if stem == store.device_id {
            continue;
        }
        let res = read_capped(&path).and_then(|b| parse(&b, known)).and_then(|(f, skipped)| {
            // The file name is the device's claim on its rows; a file may not speak for another device.
            if f.device_id != stem {
                return Err("file name and device id differ".into());
            }
            store.replace_device(&f.device_id, &f.platform, &f.counters).map_err(|e| e.to_string())?;
            Ok((f.counters.len(), skipped))
        });
        match res {
            Ok((rows, skipped)) => {
                report.devices += 1;
                report.rows += rows;
                report.skipped_rows += skipped;
            }
            Err(e) => report.problems.push(format!("{}: {e}", stem.chars().take(40).collect::<String>())),
        }
    }
    set_last(&report);
    Ok(report)
}

/// Records a failed round so the settings screen can say why.
pub fn record_failure(day: &str, err: &str) {
    set_last(&Report { day: day.into(), problems: vec![err.into()], ..Default::default() });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Kind;

    fn known(f: &str, a: &str) -> bool {
        matches!(f, "system" | "chrome") && matches!(a, "edit.copy" | "edit.undo")
    }

    fn tmpdir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("cmdnudge-sync-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn row(action: &str, kind: &str, count: i64) -> FileRow {
        FileRow {
            app_family: "system".into(),
            action_id: action.into(),
            kind: kind.into(),
            count,
            first_seen_day: "2026-11-01".into(),
            last_seen_day: "2026-11-05".into(),
        }
    }

    fn file(id: &str, rows: Vec<FileRow>) -> Vec<u8> {
        serde_json::to_vec(&DeviceFile {
            format: FORMAT.into(),
            device_id: id.into(),
            platform: id[..3].into(),
            written_on: "2026-11-05".into(),
            counters: rows,
        })
        .unwrap()
    }

    #[test]
    fn two_devices_sum_without_double_counting() {
        let dir = tmpdir("sum");
        let a = Store::in_memory().unwrap();
        let b = Store::in_memory().unwrap();
        for _ in 0..3 {
            a.record("system", "edit.copy", Kind::HabitMiss, "2026-11-05").unwrap();
        }
        b.record("system", "edit.copy", Kind::HabitMiss, "2026-11-05").unwrap();
        // Several rounds in any order must give the same totals.
        for _ in 0..3 {
            sync_folder(&a, &dir, &known, "2026-11-05").unwrap();
            sync_folder(&b, &dir, &known, "2026-11-05").unwrap();
        }
        for s in [&a, &b] {
            let p = s.progress("2026-11-05").unwrap();
            assert_eq!(p[0].misses, 4, "3 on A + 1 on B");
        }
        // A new miss on B arrives at A on the next round, still no double count.
        b.record("system", "edit.copy", Kind::HabitMiss, "2026-11-06").unwrap();
        sync_folder(&b, &dir, &known, "2026-11-06").unwrap();
        let r = sync_folder(&a, &dir, &known, "2026-11-06").unwrap();
        assert_eq!(r.devices, 1);
        assert_eq!(a.progress("2026-11-06").unwrap()[0].misses, 5);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn rejects_unknown_actions_free_text_and_bad_values() {
        let bytes = file(
            "mac-00ff",
            vec![
                row("edit.copy", "habit_miss", 2),
                row("my secret password", "habit_miss", 1),
                row("edit.undo", "typed_text", 1),
                row("edit.undo", "habit_miss", -5),
                FileRow { first_seen_day: "yesterday".into(), ..row("edit.undo", "mac_correct", 1) },
                row("edit.copy", "habit_miss", 9), // duplicate key
            ],
        );
        let (f, dropped) = parse(&bytes, &known).unwrap();
        assert_eq!(f.counters, vec![row("edit.copy", "habit_miss", 2)]);
        assert_eq!(dropped, 5);
    }

    #[test]
    fn rejects_bad_files() {
        assert!(parse(b"{}", &known).is_err());
        assert!(parse(b"not json", &known).is_err());
        assert!(parse(&file("mac-../../etc", vec![]), &known).is_err());
        assert!(parse(&file("evil-00", vec![]), &known).is_err());
        let mut f: DeviceFile = serde_json::from_slice(&file("mac-01", vec![])).unwrap();
        f.format = "other/1".into();
        assert!(parse(&serde_json::to_vec(&f).unwrap(), &known).is_err());
        f.format = FORMAT.into();
        f.platform = "win".into(); // id says mac
        assert!(parse(&serde_json::to_vec(&f).unwrap(), &known).is_err());
    }

    #[test]
    fn a_file_cannot_overwrite_this_device_or_speak_for_another() {
        let dir = tmpdir("claims");
        let a = Store::in_memory().unwrap();
        a.record("system", "edit.copy", Kind::HabitMiss, "2026-11-05").unwrap();
        let sync = sync_dir(&dir);
        std::fs::create_dir_all(&sync).unwrap();
        // A file named after device B that claims to be A.
        std::fs::write(sync.join("mac-0b.json"), file(&a.device_id, vec![row("edit.copy", "habit_miss", 500)])).unwrap();
        // A file named after device C that claims to be device D.
        std::fs::write(sync.join("mac-0c.json"), file("mac-0d", vec![row("edit.copy", "habit_miss", 7)])).unwrap();
        let r = sync_folder(&a, &dir, &known, "2026-11-05").unwrap();
        assert_eq!(r.devices, 0);
        assert_eq!(r.problems.len(), 2);
        assert!(a.other_devices().unwrap().is_empty());
        assert_eq!(a.progress("2026-11-05").unwrap()[0].misses, 1);
        // Importing a file with this device's own id is refused too.
        let p = dir.join("own.json");
        std::fs::write(&p, file(&a.device_id, vec![row("edit.copy", "habit_miss", 500)])).unwrap();
        assert!(import(&a, &p, &known, "2026-11-05").is_err());
        assert_eq!(a.progress("2026-11-05").unwrap()[0].misses, 1);
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn export_then_import_on_another_device() {
        let dir = tmpdir("export");
        let a = Store::in_memory().unwrap();
        let b = Store::in_memory().unwrap();
        a.record("chrome", "edit.undo", Kind::MacCorrect, "2026-11-05").unwrap();
        let p = dir.join("a.json");
        export(&a, &p, "2026-11-05").unwrap();
        let r = import(&b, &p, &known, "2026-11-05").unwrap();
        assert_eq!((r.devices, r.rows), (1, 1));
        assert_eq!(b.progress("2026-11-05").unwrap()[0].correct, 1);
        // Importing again replaces, never adds.
        import(&b, &p, &known, "2026-11-05").unwrap();
        assert_eq!(b.progress("2026-11-05").unwrap()[0].correct, 1);
        // B's own export holds only B's rows.
        assert!(own_file(&b, "2026-11-05").unwrap().counters.is_empty());
        std::fs::remove_dir_all(dir).ok();
    }
}
