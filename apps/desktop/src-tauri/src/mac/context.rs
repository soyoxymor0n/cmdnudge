//! Who is in front, which layout is active, which permissions we have.

use super::ffi::*;
use objc2_app_kit::NSWorkspace;
use objc2_foundation::{NSDictionary, NSNumber, NSString};
use std::ffi::c_void;

pub struct AppInfo {
    pub bundle_id: String,
    pub name: String,
}

/// The app that receives the key press. Only its bundle id (for the app family) and its
/// name (for "would quit Slack") are read; window titles never are.
pub fn frontmost_app() -> AppInfo {
    let ws = NSWorkspace::sharedWorkspace();
    match ws.frontmostApplication() {
        Some(app) => AppInfo {
            bundle_id: app.bundleIdentifier().map(|s| s.to_string()).unwrap_or_default(),
            name: app.localizedName().map(|s| s.to_string()).unwrap_or_else(|| "the app".into()),
        },
        None => AppInfo { bundle_id: String::new(), name: "the app".into() },
    }
}

/// TIS input source id, e.g. "com.apple.keylayout.Austrian". Call on the main thread.
pub fn input_source_id() -> Option<String> {
    unsafe {
        let src = TISCopyCurrentKeyboardLayoutInputSource();
        if src.is_null() {
            return None;
        }
        let id = TISGetInputSourceProperty(src, kTISPropertyInputSourceID);
        let out = (!id.is_null()).then(|| (*(id as *const NSString)).to_string());
        CFRelease(src as *const c_void);
        out
    }
}

pub fn input_monitoring_granted() -> bool {
    unsafe { CGPreflightListenEventAccess() }
}

pub fn accessibility_granted() -> bool {
    unsafe { AXIsProcessTrusted() }
}

pub fn request_input_monitoring() -> bool {
    unsafe { CGRequestListenEventAccess() }
}

pub fn request_accessibility() -> bool {
    let key = NSString::from_str("AXTrustedCheckOptionPrompt");
    let yes = NSNumber::new_bool(true);
    let dict = NSDictionary::from_slices(&[&*key], &[&*yes]);
    unsafe { AXIsProcessTrustedWithOptions(objc2::rc::Retained::as_ptr(&dict) as *const c_void) }
}

pub fn secure_input() -> bool {
    unsafe { IsSecureEventInputEnabled() != 0 }
}

/// Whether the screen is being shared or recorded right now (#24): any app capturing the screen
/// (Zoom, Teams, Meet in a browser, QuickTime, screencapture) registers as a screen watcher with the
/// window server. CGSIsScreenWatcherPresent is private API, so it is looked up at run time; if a
/// future macOS drops it, this answers false and toasts simply keep showing.
pub fn screen_shared() -> bool {
    use std::sync::OnceLock;
    static F: OnceLock<Option<extern "C" fn() -> i32>> = OnceLock::new();
    let f = F.get_or_init(|| unsafe {
        let name = c"CGSIsScreenWatcherPresent";
        let p = libc_dlsym(RTLD_DEFAULT, name.as_ptr());
        (!p.is_null()).then(|| std::mem::transmute::<*mut c_void, extern "C" fn() -> i32>(p))
    });
    f.is_some_and(|f| f() != 0)
}

const RTLD_DEFAULT: *mut c_void = -2isize as *mut c_void;
unsafe extern "C" {
    #[link_name = "dlsym"]
    fn libc_dlsym(handle: *mut c_void, symbol: *const std::ffi::c_char) -> *mut c_void;
}

pub fn reduce_motion() -> bool {
    NSWorkspace::sharedWorkspace().accessibilityDisplayShouldReduceMotion()
}

#[cfg(test)]
mod tests {
    /// The private symbol must still exist on the macOS this runs on; without it #24 never pauses.
    #[test]
    fn screen_watcher_symbol_resolves() {
        let p = unsafe { super::libc_dlsym(super::RTLD_DEFAULT, c"CGSIsScreenWatcherPresent".as_ptr()) };
        assert!(!p.is_null());
    }

    /// Manual: a real screen recording flips it (seen true on macOS 27, 2026-11-07). Ignored because
    /// `screencapture -V` can wait minutes for the recording permission on a locked or headless Mac.
    #[test]
    #[ignore]
    fn screen_watcher_follows_a_recording() {
        let out = std::env::temp_dir().join(format!("cmdnudge-share-{}.mov", std::process::id()));
        let mut rec = std::process::Command::new("screencapture").args(["-x", "-V", "3"]).arg(&out).spawn().unwrap();
        let seen = (0..20).any(|_| {
            std::thread::sleep(std::time::Duration::from_millis(150));
            super::screen_shared()
        });
        let _ = rec.wait();
        let _ = std::fs::remove_file(&out);
        assert!(seen);
    }
}
