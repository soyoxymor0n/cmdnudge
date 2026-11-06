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

pub fn reduce_motion() -> bool {
    NSWorkspace::sharedWorkspace().accessibilityDisplayShouldReduceMotion()
}
