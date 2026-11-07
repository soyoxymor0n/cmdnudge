//! cmdnudge desktop app: menu bar coach that turns Windows shortcut habits into Mac muscle memory.

mod chord;
mod engine;
mod filter;
mod keymap;
mod library;
#[cfg(target_os = "macos")]
mod mac;
mod matcher;
mod menu_tips;
mod settings;
mod store;
mod hosted;
mod sync;
mod win_recorder;
#[cfg(windows)]
mod win;

use engine::{Engine, KeyCheck, RecentHint, ToastSpec, ToastStyle};
use serde::Serialize;
use settings::Settings;
use std::sync::OnceLock;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager};

static ENGINE: OnceLock<&'static Engine> = OnceLock::new();

fn engine() -> &'static Engine {
    ENGINE.get().expect("engine initialised")
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Status {
    version: &'static str,
    paused_until: Option<i64>,
    tap: u8,
    input_monitoring: bool,
    accessibility: bool,
    secure_input: bool,
    layout: String,
    layout_detected: String,
    layout_source: String,
    keyboard: String,
    key_check: Option<KeyCheck>,
    recent: Vec<RecentHint>,
}

#[tauri::command]
fn get_status() -> Status {
    let e = engine();
    let s = e.settings.read().unwrap().clone();
    let (detected, source) = e.detected_layout.read().unwrap().clone();
    #[cfg(target_os = "macos")]
    let (tap, im, ax, secure) = (
        mac::tap::TAP_STATE.load(std::sync::atomic::Ordering::Relaxed),
        mac::context::input_monitoring_granted(),
        mac::context::accessibility_granted(),
        mac::context::secure_input(),
    );
    #[cfg(not(target_os = "macos"))]
    let (tap, im, ax, secure) = (0, false, false, false);
    Status {
        version: env!("CARGO_PKG_VERSION"),
        paused_until: s.paused_until.filter(|t| *t > engine::now()),
        tap,
        input_monitoring: im,
        accessibility: ax,
        secure_input: secure,
        layout: e.layout().id().into(),
        layout_detected: detected.id().into(),
        layout_source: source,
        keyboard: match e.keyboard() {
            library::Keyboard::Apple => "apple".into(),
            library::Keyboard::Pc => "pc".into(),
        },
        key_check: e.key_check.lock().unwrap().clone(),
        recent: e.recent.lock().unwrap().iter().cloned().collect(),
    }
}

#[tauri::command]
fn get_settings() -> Settings {
    engine().settings.read().unwrap().clone()
}

#[tauri::command]
fn save_settings(mut settings: Settings) {
    // The sync folder only changes through the folder picker (choose_sync_folder / stop_sync).
    settings.sync_folder = engine().settings.read().unwrap().sync_folder.clone();
    #[cfg(target_os = "macos")]
    mac::toast::set_position(&settings.position);
    engine().save_settings(settings);
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ActionStats {
    action_id: String,
    label: String,
    category: String,
    misses: i64,
    correct: i64,
    last_miss_day: Option<String>,
    mastered: bool,
    win_uses: i64,
    top_family: String,
    windows: String,
    mac: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Stats {
    actions: Vec<ActionStats>,
    daily: Vec<store::DailyRow>,
    today: String,
}

#[tauri::command]
fn get_stats() -> Result<Stats, String> {
    let e = engine();
    let lib = library::get();
    let today = store::today();
    let store = e.store.lock().unwrap();
    let counters = store.counters().map_err(|x| x.to_string())?;
    let progress = store.progress(&today).map_err(|x| x.to_string())?;
    let layout = e.layout();
    let keyboard = e.keyboard();
    let actions = progress
        .into_iter()
        .filter_map(|p| {
            let action = lib.action(&p.action_id)?;
            let top_family = counters
                .iter()
                .filter(|c| c.action_id == p.action_id && c.kind == "habit_miss")
                .max_by_key(|c| c.count)
                .and_then(|c| lib.family(&c.app_family))
                .map(|f| f.label.clone())
                .unwrap_or_default();
            let rule = lib
                .habit_rules
                .iter()
                .find(|r| r.action == p.action_id && r.layout == layout && r.keyboard == keyboard)
                .or_else(|| lib.habit_rules.iter().find(|r| r.action == p.action_id))?;
            Some(ActionStats {
                action_id: p.action_id,
                label: action.label.clone(),
                category: action.category.clone(),
                misses: p.misses,
                correct: p.correct,
                last_miss_day: p.last_miss_day,
                mastered: p.mastered,
                win_uses: p.win_uses,
                top_family,
                windows: chord::format_windows(&rule.windows),
                mac: chord::format_mac(&rule.mac[0]),
            })
        })
        .collect();
    Ok(Stats { actions, daily: store.daily().map_err(|x| x.to_string())?, today })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RawRows {
    counters: Vec<store::CounterRow>,
    daily: Vec<store::DailyRow>,
    columns: Vec<(String, Vec<String>)>,
    device_id: String,
}

#[tauri::command]
fn get_raw_rows() -> Result<RawRows, String> {
    let store = engine().store.lock().unwrap();
    Ok(RawRows {
        counters: store.counters().map_err(|x| x.to_string())?,
        daily: store.daily().map_err(|x| x.to_string())?,
        columns: store.columns().map_err(|x| x.to_string())?,
        device_id: store.device_id.clone(),
    })
}

fn tomorrow_morning() -> i64 {
    use chrono::{Duration, Local, TimeZone};
    let d = Local::now().date_naive() + Duration::days(1);
    Local
        .from_local_datetime(&d.and_hms_opt(6, 0, 0).unwrap())
        .single()
        .map(|t| t.timestamp())
        .unwrap_or_else(|| engine::now() + 8 * 3600)
}

#[tauri::command]
fn pause(minutes: Option<i64>) {
    let e = engine();
    let mut s = e.settings.read().unwrap().clone();
    s.paused_until = Some(match minutes {
        Some(m) => engine::now() + m * 60,
        None => tomorrow_morning(),
    });
    e.save_settings(s);
}

#[tauri::command]
fn resume() {
    let e = engine();
    let mut s = e.settings.read().unwrap().clone();
    s.paused_until = None;
    e.save_settings(s);
}

#[tauri::command]
fn request_permission(kind: String) -> bool {
    #[cfg(target_os = "macos")]
    {
        let granted = match kind.as_str() {
            "accessibility" => mac::context::request_accessibility(),
            _ => mac::context::request_input_monitoring(),
        };
        if !granted {
            let _ = std::process::Command::new("open").arg(mac::settings_url(&kind)).spawn();
        }
        granted
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = kind;
        false
    }
}

#[tauri::command]
fn test_toast(kind: String) {
    let e = engine();
    let lib = library::get();
    let (habit, blocked) = if kind == "guard" { ("at-sign", true) } else { ("copy", false) };
    let rule = lib
        .habit_rules
        .iter()
        .find(|r| r.habit == habit && r.layout == e.layout() && r.keyboard == e.keyboard())
        .or_else(|| lib.habit_rules.iter().find(|r| r.habit == habit && r.keyboard == e.keyboard()))
        .or_else(|| lib.habit_rules.iter().find(|r| r.habit == habit));
    if let Some(r) = rule {
        e.show_toast(engine::toast_for(r, "Slack", blocked, false, false));
    } else {
        e.show_toast(ToastSpec {
            from: "Ctrl+C".into(),
            to: "⌘C".into(),
            detail: "Copy".into(),
            style: ToastStyle::Hint,
            duration_ms: 2500,
        });
    }
}

fn known_pair(family: &str, action: &str) -> bool {
    let lib = library::get();
    lib.family(family).is_some() && lib.action(action).is_some()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncStatus {
    folder: Option<String>,
    device_id: String,
    last: Option<sync::Report>,
    devices: Vec<(String, i64)>,
}

#[tauri::command]
fn sync_status() -> Result<SyncStatus, String> {
    let e = engine();
    let store = e.store.lock().unwrap();
    Ok(SyncStatus {
        folder: e.settings.read().unwrap().sync_folder.clone(),
        device_id: store.device_id.clone(),
        last: sync::last_report(),
        devices: store.other_devices().map_err(|x| x.to_string())?,
    })
}

/// One file-sync round if a folder is set. Returns None when sync is off.
fn run_sync() -> Option<Result<sync::Report, String>> {
    let e = engine();
    let folder = e.settings.read().unwrap().sync_folder.clone()?;
    let day = store::today();
    let res = {
        let store = e.store.lock().unwrap();
        sync::sync_folder(&store, std::path::Path::new(&folder), &known_pair, &day)
    };
    if let Err(err) = &res {
        sync::record_failure(&day, err);
    }
    e.notify();
    Some(res)
}

#[tauri::command]
fn sync_now() -> Result<SyncStatus, String> {
    if let Some(Err(e)) = run_sync() {
        return Err(e);
    }
    sync_status()
}

#[tauri::command]
async fn choose_sync_folder(app: AppHandle) -> Result<Option<SyncStatus>, String> {
    use tauri_plugin_dialog::DialogExt;
    let mut dialog = app.dialog().file().set_title("Choose a folder both computers can reach");
    if let Ok(home) = app.path().home_dir() {
        let icloud = home.join("Library/Mobile Documents/com~apple~CloudDocs");
        if icloud.is_dir() {
            dialog = dialog.set_directory(icloud);
        }
    }
    let Some(picked) = dialog.blocking_pick_folder() else { return Ok(None) };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    let e = engine();
    let mut s = e.settings.read().unwrap().clone();
    s.sync_folder = Some(path.to_string_lossy().into_owned());
    e.save_settings(s);
    sync_now().map(Some)
}

#[tauri::command]
fn stop_sync(forget: bool) -> Result<SyncStatus, String> {
    let e = engine();
    let mut s = e.settings.read().unwrap().clone();
    s.sync_folder = None;
    e.save_settings(s);
    if forget {
        e.store.lock().unwrap().forget_other_devices().map_err(|x| x.to_string())?;
    }
    e.notify();
    sync_status()
}

/* ---------- Sync with an account (#18) ---------------------------------------------------- */

static HOSTED_ERROR: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

fn hosted_token() -> Option<String> {
    engine().store.lock().unwrap().setting(hosted::TOKEN_KEY)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HostedStatus {
    server: String,
    availability: hosted::Availability,
    linked: bool,
    error: Option<String>,
}

#[tauri::command]
async fn hosted_status() -> HostedStatus {
    let server = hosted::server();
    HostedStatus {
        availability: hosted::availability(&server),
        server,
        linked: hosted_token().is_some(),
        error: HOSTED_ERROR.lock().unwrap().clone(),
    }
}

/// One round of account sync if this app is linked. None when it is not.
fn run_hosted() -> Option<Result<sync::Report, String>> {
    let token = hosted_token()?;
    let e = engine();
    let day = store::today();
    let res = sync::hosted_sync(&e.store, &hosted::server(), &token, &known_pair, &day);
    match &res {
        Ok(_) => *HOSTED_ERROR.lock().unwrap() = None,
        Err(err) => {
            if err == sync::SIGNED_OUT {
                // The server no longer knows this link (unlinked elsewhere, account deleted).
                let _ = e.store.lock().unwrap().remove_setting(hosted::TOKEN_KEY);
            }
            *HOSTED_ERROR.lock().unwrap() = Some(err.clone());
            sync::record_failure(&day, err);
        }
    }
    e.notify();
    Some(res)
}

#[tauri::command]
fn hosted_connect(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let url = hosted::begin_link(&hosted::server());
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
async fn hosted_sync_now() -> Result<SyncStatus, String> {
    match run_hosted() {
        Some(Err(e)) => Err(e),
        _ => sync_status(),
    }
}

#[tauri::command]
async fn hosted_disconnect(forget: bool) -> Result<SyncStatus, String> {
    let e = engine();
    if let Some(token) = hosted_token() {
        hosted::unlink(&hosted::server(), &token);
    }
    {
        let store = e.store.lock().unwrap();
        store.remove_setting(hosted::TOKEN_KEY).map_err(|x| x.to_string())?;
        if forget {
            store.forget_other_devices().map_err(|x| x.to_string())?;
        }
    }
    *HOSTED_ERROR.lock().unwrap() = None;
    e.notify();
    sync_status()
}

/// `cmdnudge://link?...` from the /connect page after sign-in.
fn on_deep_link(app: &AppHandle, url: &str) {
    match hosted::finish_link(url) {
        Ok(token) => {
            let _ = engine().store.lock().unwrap().set_setting(hosted::TOKEN_KEY, &token);
            *HOSTED_ERROR.lock().unwrap() = None;
            std::thread::spawn(|| {
                let _ = run_hosted();
            });
        }
        Err(err) => *HOSTED_ERROR.lock().unwrap() = Some(err),
    }
    show_window(app, Some("settings"));
    let _ = app.emit("cmdnudge://changed", ());
}

#[tauri::command]
async fn export_data(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let mut dialog = app
        .dialog()
        .file()
        .set_title("Export your counters")
        .set_file_name(format!("cmdnudge-{}.json", store::today()))
        .add_filter("cmdnudge counters", &["json"]);
    if let Ok(dir) = app.path().download_dir() {
        dialog = dialog.set_directory(dir);
    }
    let Some(picked) = dialog.blocking_save_file() else { return Ok(None) };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    sync::export(&engine().store.lock().unwrap(), &path, &store::today())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
async fn import_data(app: AppHandle) -> Result<Option<sync::Report>, String> {
    use tauri_plugin_dialog::DialogExt;
    let Some(picked) = app
        .dialog()
        .file()
        .set_title("Import counters from your other computer")
        .add_filter("cmdnudge counters", &["json"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    let report = sync::import(&engine().store.lock().unwrap(), &path, &known_pair, &store::today())?;
    engine().notify();
    Ok(Some(report))
}

#[tauri::command]
fn reset_counts() -> Result<(), String> {
    engine().store.lock().unwrap().reset_counts().map_err(|e| e.to_string())?;
    engine().notify();
    Ok(())
}

#[tauri::command]
fn get_library() -> &'static str {
    library::LIBRARY_JSON
}

fn show_window(app: &AppHandle, view: Option<&str>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        if let Some(v) = view {
            let _ = w.emit("cmdnudge://navigate", v);
        }
    }
}

fn status_line() -> String {
    let s = engine().settings.read().unwrap().clone();
    if let Some(t) = s.paused_until.filter(|t| *t > engine::now()) {
        let local = chrono::DateTime::from_timestamp(t, 0)
            .map(|d| d.with_timezone(&chrono::Local).format("%a %H:%M").to_string())
            .unwrap_or_default();
        return format!("Paused until {local}");
    }
    #[cfg(target_os = "macos")]
    {
        match mac::tap::TAP_STATE.load(std::sync::atomic::Ordering::Relaxed) {
            0 => return "Needs Input Monitoring permission".into(),
            1 => return "Watching (guard off: needs Accessibility)".into(),
            _ => {}
        }
    }
    "Watching for Windows habits".into()
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let e = engine();
    let paused = e.settings.read().unwrap().is_paused(engine::now());
    let menu = Menu::new(app)?;
    menu.append(&MenuItem::with_id(app, "status", status_line(), false, None::<&str>)?)?;
    let recent = e.recent.lock().unwrap().clone();
    if !recent.is_empty() {
        menu.append(&PredefinedMenuItem::separator(app)?)?;
        menu.append(&MenuItem::with_id(app, "recent-h", "Recent hints", false, None::<&str>)?)?;
        for (i, r) in recent.iter().enumerate() {
            let text = if r.guarded {
                format!("{} {} · {}", r.from, r.to, r.label)
            } else {
                format!("{} → {}   {}", r.from, r.to, r.label)
            };
            menu.append(&MenuItem::with_id(app, format!("recent-{i}"), text, true, None::<&str>)?)?;
        }
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    if paused {
        menu.append(&MenuItem::with_id(app, "resume", "Resume", true, None::<&str>)?)?;
    } else {
        menu.append(&MenuItem::with_id(app, "pause-1h", "Pause for 1 hour", true, None::<&str>)?)?;
        menu.append(&MenuItem::with_id(app, "pause-tomorrow", "Pause until tomorrow", true, None::<&str>)?)?;
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "open-stats", "Your habits…", true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "open-settings", "Settings…", true, Some("CmdOrCtrl+,"))?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "quit", "Quit cmdnudge", true, Some("CmdOrCtrl+Q"))?)?;
    Ok(menu)
}

fn refresh_tray(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let (Some(tray), Ok(menu)) = (handle.tray_by_id("main"), build_menu(&handle)) {
            let _ = tray.set_menu(Some(menu));
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_status,
            get_settings,
            save_settings,
            get_stats,
            get_raw_rows,
            pause,
            resume,
            request_permission,
            test_toast,
            export_data,
            import_data,
            sync_status,
            sync_now,
            choose_sync_folder,
            hosted_status,
            hosted_connect,
            hosted_sync_now,
            hosted_disconnect,
            stop_sync,
            reset_counts,
            get_library
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let store = store::Store::open(&dir.join("cmdnudge.db")).expect("open the local database");
            let e: &'static Engine = Box::leak(Box::new(Engine::new(store)));
            let _ = ENGINE.set(e);
            e.start_worker();

            let handle = app.handle().clone();
            e.on_changed(move || {
                let _ = handle.emit("cmdnudge://changed", ());
                refresh_tray(&handle);
            });

            // Windows (#17): count the library's Windows shortcuts; no toast, nothing blocked (D10).
            #[cfg(windows)]
            win::start(win_recorder::Recorder::new(library::get()), move |family, action| {
                e.record_win_use(family, action);
            });

            #[cfg(target_os = "macos")]
            {
                mac::toast::init(app.handle().clone());
                mac::toast::set_position(&e.settings.read().unwrap().position);
                e.on_toast(|spec| {
                    // #24: no toast while the screen is shared or recorded (counting goes on).
                    if engine().settings.read().unwrap().toasts_allowed(mac::context::screen_shared()) {
                        mac::toast::show(spec);
                    }
                });
                // The layout can change at any time (menu bar input menu). TIS wants the main thread.
                let handle = app.handle().clone();
                std::thread::spawn(move || loop {
                    let h = handle.clone();
                    let _ = handle.run_on_main_thread(move || {
                        if let Some(id) = mac::context::input_source_id() {
                            let layout = keymap::Layout::from_input_source(&id);
                            let mut cur = engine().detected_layout.write().unwrap();
                            if cur.1 != id {
                                *cur = (layout, id);
                                drop(cur);
                                let _ = h.emit("cmdnudge://changed", ());
                            }
                        }
                    });
                    std::thread::sleep(std::time::Duration::from_secs(2));
                });
                mac::tap::start(e);
                mac::menus::start(e);
                // Tray status follows the tap state (permissions can be granted at any time).
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    let mut last = 255u8;
                    loop {
                        let now = mac::tap::TAP_STATE.load(std::sync::atomic::Ordering::Relaxed);
                        if now != last {
                            last = now;
                            refresh_tray(&handle);
                            let _ = handle.emit("cmdnudge://changed", ());
                        }
                        std::thread::sleep(std::time::Duration::from_secs(1));
                    }
                });
            }

            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray-template.png"))?;
            TrayIconBuilder::with_id("main")
                .icon(icon)
                .icon_as_template(true)
                .tooltip("cmdnudge")
                .menu(&build_menu(app.handle())?)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "pause-1h" => pause(Some(60)),
                    "pause-tomorrow" => pause(None),
                    "resume" => resume(),
                    "open-stats" => show_window(app, Some("stats")),
                    "open-settings" => show_window(app, Some("settings")),
                    id if id.starts_with("recent-") => show_window(app, Some("stats")),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            // CMDNUDGE_DEMO=hint|guard shows a toast right after launch (screenshots, smoke tests).
            if let Ok(kind) = std::env::var("CMDNUDGE_DEMO") {
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(800));
                    test_toast(kind);
                });
            }
            // Account sync (#18): the /connect page hands the link back through cmdnudge://link.
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        on_deep_link(&handle, url.as_str());
                    }
                });
            }
            // File sync (#16) and account sync (#18): a round at launch, then every five minutes
            // for whichever is switched on.
            std::thread::spawn(|| loop {
                std::thread::sleep(std::time::Duration::from_secs(5));
                let _ = run_sync();
                let _ = run_hosted();
                std::thread::sleep(std::time::Duration::from_secs(295));
            });
            if !e.settings.read().unwrap().onboarded {
                show_window(app.handle(), Some("onboarding"));
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running cmdnudge");
}
