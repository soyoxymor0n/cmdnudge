//! #30: is the keyboard focus in a built-in terminal? VS Code, Cursor and other Electron apps draw
//! their terminal with xterm.js, whose focused element carries the DOM class
//! "xterm-helper-textarea". Only that class list is read, never the element's text or title.
//! Needs Accessibility; without it (or for native apps) the answer is "no".

#![allow(unsafe_op_in_unsafe_fn)]

use objc2_foundation::NSString;
use std::ffi::{c_void, CString};
use std::sync::OnceLock;

type AXUIElementRef = *const c_void;
type CFTypeRef = *const c_void;
type CFStringRef = *const c_void;

const K_CF_STRING_ENCODING_UTF8: u32 = 0x0800_0100;
const XTERM_CLASS: &str = "xterm-helper-textarea";

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXUIElementCreateSystemWide() -> AXUIElementRef;
    fn AXUIElementCopyAttributeValue(e: AXUIElementRef, attr: CFStringRef, out: *mut CFTypeRef) -> i32;
    fn AXUIElementSetMessagingTimeout(e: AXUIElementRef, seconds: f32) -> i32;
}

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFStringCreateWithCString(alloc: *const c_void, s: *const i8, enc: u32) -> CFStringRef;
    fn CFGetTypeID(cf: CFTypeRef) -> usize;
    fn CFStringGetTypeID() -> usize;
    fn CFArrayGetTypeID() -> usize;
    fn CFArrayGetCount(a: CFTypeRef) -> isize;
    fn CFArrayGetValueAtIndex(a: CFTypeRef, i: isize) -> CFTypeRef;
    fn CFRelease(cf: CFTypeRef);
}

struct Refs {
    system: usize,
    focused: usize,
    classes: usize,
}

fn refs() -> &'static Refs {
    static R: OnceLock<Refs> = OnceLock::new();
    R.get_or_init(|| unsafe {
        let s = |x: &str| {
            let c = CString::new(x).unwrap();
            CFStringCreateWithCString(std::ptr::null(), c.as_ptr(), K_CF_STRING_ENCODING_UTF8) as usize
        };
        let system = AXUIElementCreateSystemWide();
        // A hung app must not hold up the key press (translate and strict modes ask in the tap).
        AXUIElementSetMessagingTimeout(system, 0.08);
        Refs { system: system as usize, focused: s("AXFocusedUIElement"), classes: s("AXDOMClassList") }
    })
}

unsafe fn copy(e: AXUIElementRef, name: usize) -> Option<CFTypeRef> {
    let mut v: CFTypeRef = std::ptr::null();
    (AXUIElementCopyAttributeValue(e, name as CFStringRef, &mut v) == 0 && !v.is_null()).then_some(v)
}

pub fn in_terminal() -> bool {
    if !super::context::accessibility_granted() {
        return false;
    }
    let r = refs();
    unsafe {
        let Some(el) = copy(r.system as AXUIElementRef, r.focused) else { return false };
        let classes = copy(el, r.classes);
        CFRelease(el);
        let Some(list) = classes else { return false };
        let mut found = false;
        if CFGetTypeID(list) == CFArrayGetTypeID() {
            for i in 0..CFArrayGetCount(list) {
                let v = CFArrayGetValueAtIndex(list, i);
                if CFGetTypeID(v) == CFStringGetTypeID() && (*(v as *const NSString)).to_string() == XTERM_CLASS {
                    found = true;
                    break;
                }
            }
        }
        CFRelease(list);
        found
    }
}
