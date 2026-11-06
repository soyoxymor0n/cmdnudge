//! Raw CoreGraphics / CoreFoundation / Carbon bindings used by the tap and context modules.
#![allow(non_upper_case_globals, dead_code)]

use std::ffi::c_void;

pub type CGEventRef = *mut c_void;
pub type CFMachPortRef = *mut c_void;
pub type CFRunLoopSourceRef = *mut c_void;
pub type CFRunLoopRef = *mut c_void;
pub type CFStringRef = *const c_void;

pub type TapCallback = extern "C" fn(*mut c_void, u32, CGEventRef, *mut c_void) -> CGEventRef;

pub const K_CG_HID_EVENT_TAP: u32 = 0;
pub const K_CG_SESSION_EVENT_TAP: u32 = 1;
pub const K_CG_HEAD_INSERT_EVENT_TAP: u32 = 0;
pub const K_CG_EVENT_TAP_OPTION_DEFAULT: u32 = 0;
pub const K_CG_EVENT_TAP_OPTION_LISTEN_ONLY: u32 = 1;

pub const K_CG_EVENT_KEY_DOWN: u32 = 10;
pub const K_CG_EVENT_TAP_DISABLED_BY_TIMEOUT: u32 = 0xFFFF_FFFE;
pub const K_CG_EVENT_TAP_DISABLED_BY_USER_INPUT: u32 = 0xFFFF_FFFF;

pub const K_CG_KEYBOARD_EVENT_AUTOREPEAT: u32 = 8;
pub const K_CG_KEYBOARD_EVENT_KEYCODE: u32 = 9;
pub const K_CG_EVENT_SOURCE_USER_DATA: u32 = 42;

pub const K_CG_EVENT_FLAG_MASK_SHIFT: u64 = 0x0002_0000;
pub const K_CG_EVENT_FLAG_MASK_CONTROL: u64 = 0x0004_0000;
pub const K_CG_EVENT_FLAG_MASK_ALTERNATE: u64 = 0x0008_0000;
pub const K_CG_EVENT_FLAG_MASK_COMMAND: u64 = 0x0010_0000;
// Device-dependent bits (IOLLEvent.h): which side the modifier is on.
pub const NX_DEVICELCMDKEYMASK: u64 = 0x0000_0008;
pub const NX_DEVICERCMDKEYMASK: u64 = 0x0000_0010;
pub const NX_DEVICELALTKEYMASK: u64 = 0x0000_0020;
pub const NX_DEVICERALTKEYMASK: u64 = 0x0000_0040;

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    pub fn CGEventTapCreate(
        tap: u32,
        place: u32,
        options: u32,
        events_of_interest: u64,
        callback: TapCallback,
        user_info: *mut c_void,
    ) -> CFMachPortRef;
    pub fn CGEventTapEnable(tap: CFMachPortRef, enable: bool);
    pub fn CGEventGetFlags(event: CGEventRef) -> u64;
    pub fn CGEventSetFlags(event: CGEventRef, flags: u64);
    pub fn CGEventGetIntegerValueField(event: CGEventRef, field: u32) -> i64;
    pub fn CGEventSetIntegerValueField(event: CGEventRef, field: u32, value: i64);
    pub fn CGEventCreateKeyboardEvent(source: *mut c_void, keycode: u16, key_down: bool) -> CGEventRef;
    pub fn CGEventPost(tap: u32, event: CGEventRef);
    pub fn CGPreflightListenEventAccess() -> bool;
    pub fn CGRequestListenEventAccess() -> bool;
}

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    pub static kCFRunLoopCommonModes: CFStringRef;
    pub static kCFRunLoopDefaultMode: CFStringRef;
    pub fn CFMachPortCreateRunLoopSource(alloc: *const c_void, port: CFMachPortRef, order: isize) -> CFRunLoopSourceRef;
    pub fn CFMachPortInvalidate(port: CFMachPortRef);
    pub fn CFRunLoopGetCurrent() -> CFRunLoopRef;
    pub fn CFRunLoopAddSource(rl: CFRunLoopRef, source: CFRunLoopSourceRef, mode: CFStringRef);
    pub fn CFRunLoopRemoveSource(rl: CFRunLoopRef, source: CFRunLoopSourceRef, mode: CFStringRef);
    pub fn CFRunLoopRun();
    pub fn CFRunLoopRunInMode(mode: CFStringRef, seconds: f64, return_after_source_handled: bool) -> i32;
    pub fn CFRelease(cf: *const c_void);
}

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    pub fn AXIsProcessTrusted() -> bool;
    pub fn AXIsProcessTrustedWithOptions(options: *const c_void) -> bool;
}

#[link(name = "Carbon", kind = "framework")]
unsafe extern "C" {
    pub fn IsSecureEventInputEnabled() -> u8;
    pub fn TISCopyCurrentKeyboardLayoutInputSource() -> *mut c_void;
    pub fn TISGetInputSourceProperty(source: *mut c_void, key: CFStringRef) -> *const c_void;
    pub static kTISPropertyInputSourceID: CFStringRef;
}
