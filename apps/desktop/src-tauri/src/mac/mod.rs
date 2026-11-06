//! macOS platform layer: capture (tap), context (app, layout, permissions), toast.
pub mod context;
mod ffi;
pub mod tap;
pub mod toast;

/// System Settings deep links for the two permissions.
pub fn settings_url(kind: &str) -> &'static str {
    match kind {
        "accessibility" => "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
        _ => "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent",
    }
}
