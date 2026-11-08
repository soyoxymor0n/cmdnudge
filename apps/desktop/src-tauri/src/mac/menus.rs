//! Mouse-to-menu tips (#19), macOS side: an Accessibility observer on the frontmost app's menus.
//!
//! AXMenuItemSelected (older macOS) or AXSelectedChildrenChanged on the open AXMenu (macOS 26+,
//! which no longer posts AXMenuItemSelected) tells us which item is highlighted (its shortcut,
//! title and frame are read right then); AXMenuClosed tells us the menu is gone. If the pointer
//! is over the highlighted item then and a left mouse-up follows the highlight, the item was
//! picked with the mouse (menu_tips::judge). macOS can register that mouse-up after the close,
//! so the verdict is settled from the watcher loop.
//! Off unless the user switches it on; needs Accessibility. Nothing here is stored.

#![allow(unsafe_op_in_unsafe_fn)]

use super::ffi::{CFRelease, CFRunLoopAddSource, CFRunLoopGetCurrent, CFRunLoopRemoveSource, CFRunLoopRunInMode, CFStringRef, kCFRunLoopDefaultMode};
use crate::engine::{Engine, ToastSpec, ToastStyle};
use crate::menu_tips::{self, Tracker};
use objc2_app_kit::NSWorkspace;
use objc2_foundation::NSString;
use std::cell::RefCell;
use std::ffi::{c_void, CString};
use std::time::Instant;

type AXUIElementRef = *const c_void;
type AXObserverRef = *mut c_void;
type CFTypeRef = *const c_void;
type AXObserverCallback = extern "C" fn(AXObserverRef, AXUIElementRef, CFStringRef, *mut c_void);

#[repr(C)]
#[derive(Default, Clone, Copy)]
struct CGPoint {
    x: f64,
    y: f64,
}
#[repr(C)]
#[derive(Default, Clone, Copy)]
struct CGSize {
    w: f64,
    h: f64,
}

const K_AX_VALUE_CGPOINT: u32 = 1;
const K_AX_VALUE_CGSIZE: u32 = 2;
const K_CF_NUMBER_SINT64: i32 = 4;
const K_CF_STRING_ENCODING_UTF8: u32 = 0x0800_0100;
const K_CG_EVENT_SOURCE_STATE_COMBINED: i32 = 0;
const K_CG_EVENT_LEFT_MOUSE_UP: u32 = 2;

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXUIElementCreateApplication(pid: i32) -> AXUIElementRef;
    fn AXObserverCreate(pid: i32, callback: AXObserverCallback, out: *mut AXObserverRef) -> i32;
    fn AXObserverAddNotification(o: AXObserverRef, e: AXUIElementRef, n: CFStringRef, refcon: *mut c_void) -> i32;
    fn AXObserverGetRunLoopSource(o: AXObserverRef) -> *mut c_void;
    fn AXUIElementCopyAttributeValue(e: AXUIElementRef, attr: CFStringRef, out: *mut CFTypeRef) -> i32;
    fn AXValueGetValue(v: CFTypeRef, kind: u32, out: *mut c_void) -> bool;
}

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGEventSourceSecondsSinceLastEventType(state: i32, kind: u32) -> f64;
    fn CGEventCreate(source: *const c_void) -> *mut c_void;
    fn CGEventGetLocation(e: *mut c_void) -> CGPoint;
}

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFStringCreateWithCString(alloc: *const c_void, s: *const i8, enc: u32) -> CFStringRef;
    fn CFGetTypeID(cf: CFTypeRef) -> usize;
    fn CFStringGetTypeID() -> usize;
    fn CFNumberGetTypeID() -> usize;
    fn CFNumberGetValue(n: CFTypeRef, kind: i32, out: *mut c_void) -> bool;
    fn CFArrayGetTypeID() -> usize;
    fn CFArrayGetCount(a: CFTypeRef) -> isize;
    fn CFArrayGetValueAtIndex(a: CFTypeRef, i: isize) -> CFTypeRef;
}

/// A CFString that lives for the whole process (attribute and notification names).
fn cfstr(s: &str) -> CFStringRef {
    let c = CString::new(s).unwrap();
    unsafe { CFStringCreateWithCString(std::ptr::null(), c.as_ptr(), K_CF_STRING_ENCODING_UTF8) }
}

struct Names {
    selected: CFStringRef,
    children_changed: CFStringRef,
    selected_children: CFStringRef,
    role: CFStringRef,
    closed: CFStringRef,
    title: CFStringRef,
    cmd_char: CFStringRef,
    cmd_mods: CFStringRef,
    cmd_glyph: CFStringRef,
    position: CFStringRef,
    size: CFStringRef,
}

struct Highlight {
    shortcut: String,
    title: String,
    frame: (f64, f64, f64, f64),
    at: Instant,
}

struct State {
    engine: &'static Engine,
    names: Names,
    bundle_id: String,
    highlight: Option<Highlight>,
    /// A menu closed over its highlighted item; waiting for the mouse-up (menu_tips::judge).
    pending: Option<(Highlight, f64, Instant)>,
    tracker: Tracker,
}

thread_local! {
    static STATE: RefCell<Option<State>> = const { RefCell::new(None) };
}

unsafe fn copy_attr(e: AXUIElementRef, name: CFStringRef) -> Option<CFTypeRef> {
    let mut v: CFTypeRef = std::ptr::null();
    (AXUIElementCopyAttributeValue(e, name, &mut v) == 0 && !v.is_null()).then_some(v)
}

unsafe fn attr_string(e: AXUIElementRef, name: CFStringRef) -> Option<String> {
    let v = copy_attr(e, name)?;
    let out = (CFGetTypeID(v) == CFStringGetTypeID()).then(|| (*(v as *const NSString)).to_string());
    CFRelease(v);
    out
}

unsafe fn attr_i64(e: AXUIElementRef, name: CFStringRef) -> Option<i64> {
    let v = copy_attr(e, name)?;
    let mut n: i64 = 0;
    let ok = CFGetTypeID(v) == CFNumberGetTypeID() && CFNumberGetValue(v, K_CF_NUMBER_SINT64, &mut n as *mut i64 as *mut c_void);
    CFRelease(v);
    ok.then_some(n)
}

unsafe fn attr_value<T: Default>(e: AXUIElementRef, name: CFStringRef, kind: u32) -> Option<T> {
    let v = copy_attr(e, name)?;
    let mut out = T::default();
    let ok = AXValueGetValue(v, kind, &mut out as *mut T as *mut c_void);
    CFRelease(v);
    ok.then_some(out)
}

fn pointer() -> (f64, f64) {
    unsafe {
        let e = CGEventCreate(std::ptr::null());
        if e.is_null() {
            return (-1.0, -1.0);
        }
        let p = CGEventGetLocation(e);
        CFRelease(e as *const c_void);
        (p.x, p.y)
    }
}

/// Remembers the highlighted menu item, if it has a shortcut. The same item highlighted again (as
/// after the click flash) keeps its first time, so "highlighted before the mouse-up" still holds.
unsafe fn highlight(st: &mut State, element: AXUIElementRef) {
    let n = &st.names;
    let cmd_char = attr_string(element, n.cmd_char);
    let mods = attr_i64(element, n.cmd_mods).unwrap_or(0);
    let glyph = attr_i64(element, n.cmd_glyph);
    let next = menu_tips::format_shortcut(cmd_char.as_deref(), mods, glyph).and_then(|shortcut| {
        let pos: CGPoint = attr_value(element, n.position, K_AX_VALUE_CGPOINT)?;
        let size: CGSize = attr_value(element, n.size, K_AX_VALUE_CGSIZE)?;
        Some(Highlight { shortcut, title: attr_string(element, n.title).unwrap_or_default(), frame: (pos.x, pos.y, size.w, size.h), at: Instant::now() })
    });
    st.highlight = match (st.highlight.take(), next) {
        (Some(old), Some(new)) if old.title == new.title && old.frame == new.frame && old.shortcut == new.shortcut => Some(old),
        (_, next) => next,
    };
}

extern "C" fn on_notification(_o: AXObserverRef, element: AXUIElementRef, notification: CFStringRef, _refcon: *mut c_void) {
    STATE.with(|cell| {
        let mut guard = cell.borrow_mut();
        let Some(st) = guard.as_mut() else { return };
        let name = unsafe { (*(notification as *const NSString)).to_string() };
        let debug = std::env::var_os("CMDNUDGE_DEBUG").is_some();
        unsafe {
            if debug {
                eprintln!("menus: {name} title={:?}", attr_string(element, st.names.title));
            }
            if name == "AXMenuItemSelected" {
                highlight(st, element);
            } else if name == "AXSelectedChildrenChanged" {
                // macOS 26+: the open menu reports its highlighted item as its selected child. An
                // empty selection (the click flash, the pointer leaving the menu) keeps the last one;
                // the pick check still needs the pointer over it.
                if attr_string(element, st.names.role).as_deref() != Some("AXMenu") {
                    return;
                }
                let Some(list) = copy_attr(element, st.names.selected_children) else { return };
                if CFGetTypeID(list) == CFArrayGetTypeID() && CFArrayGetCount(list) > 0 {
                    highlight(st, CFArrayGetValueAtIndex(list, 0));
                }
                CFRelease(list);
            } else if name == "AXMenuClosed" {
                let Some(h) = st.highlight.take() else { return };
                if debug {
                    eprintln!("menus: closed after {:?} ({}), pointer {:?}, frame {:?}", h.at.elapsed(), h.shortcut, pointer(), h.frame);
                }
                if menu_tips::inside(pointer(), h.frame) {
                    let highlighted = h.at.elapsed().as_secs_f64();
                    st.pending = Some((h, highlighted, Instant::now()));
                    settle(st, debug);
                }
            }
        }
    });
}

/// Decides a pending close once its mouse-up is known (or can no longer come), and shows the tip
/// on the third pick of the same item.
fn settle(st: &mut State, debug: bool) {
    let Some((_, highlighted, closed)) = st.pending.as_ref() else { return };
    let since_up = unsafe { CGEventSourceSecondsSinceLastEventType(K_CG_EVENT_SOURCE_STATE_COMBINED, K_CG_EVENT_LEFT_MOUSE_UP) };
    let verdict = menu_tips::judge(*highlighted, closed.elapsed().as_secs_f64(), since_up);
    if verdict == menu_tips::Verdict::Wait {
        return;
    }
    let (h, _, _) = st.pending.take().unwrap();
    if debug {
        eprintln!("menus: {:?}: {verdict:?}", h.title);
    }
    if verdict != menu_tips::Verdict::Picked {
        return;
    }
    if !st.engine.menu_tips_allowed(&st.bundle_id) {
        if debug {
            eprintln!("menus: tips not allowed in {}", st.bundle_id);
        }
        return;
    }
    let key = menu_tips::item_key(&st.bundle_id, &h.title, &h.shortcut);
    let tip = st.tracker.picked(key, Instant::now());
    if debug {
        eprintln!("menus: mouse pick of {:?} in {}, tip now: {tip}", h.title, st.bundle_id);
    }
    if tip {
        let detail = if h.title.is_empty() { "You picked it from the menu".to_string() } else { h.title.chars().take(60).collect() };
        st.engine.show_toast(ToastSpec { from: "Tip".into(), to: h.shortcut, detail, style: ToastStyle::Tip, duration_ms: 3500, keep: None });
    }
}

struct Observing {
    pid: i32,
    observer: AXObserverRef,
    source: *mut c_void,
    app: AXUIElementRef,
}

unsafe fn observe(pid: i32) -> Option<Observing> {
    let mut observer: AXObserverRef = std::ptr::null_mut();
    if AXObserverCreate(pid, on_notification, &mut observer) != 0 || observer.is_null() {
        return None;
    }
    let app = AXUIElementCreateApplication(pid);
    STATE.with(|cell| {
        if let Some(st) = cell.borrow().as_ref() {
            AXObserverAddNotification(observer, app, st.names.selected, std::ptr::null_mut());
            AXObserverAddNotification(observer, app, st.names.children_changed, std::ptr::null_mut());
            AXObserverAddNotification(observer, app, st.names.closed, std::ptr::null_mut());
        }
    });
    let source = AXObserverGetRunLoopSource(observer);
    CFRunLoopAddSource(CFRunLoopGetCurrent(), source, kCFRunLoopDefaultMode);
    Some(Observing { pid, observer, source, app })
}

unsafe fn stop(o: Observing) {
    CFRunLoopRemoveSource(CFRunLoopGetCurrent(), o.source, kCFRunLoopDefaultMode);
    CFRelease(o.observer as *const c_void);
    CFRelease(o.app);
}

/// Starts the watcher thread. It follows the frontmost app and only observes while the setting
/// is on and Accessibility is granted.
pub fn start(engine: &'static Engine) {
    std::thread::Builder::new()
        .name("cmdnudge-menus".into())
        .spawn(move || {
            STATE.with(|cell| {
                *cell.borrow_mut() = Some(State {
                    engine,
                    names: Names {
                        selected: cfstr("AXMenuItemSelected"),
                        children_changed: cfstr("AXSelectedChildrenChanged"),
                        selected_children: cfstr("AXSelectedChildren"),
                        role: cfstr("AXRole"),
                        closed: cfstr("AXMenuClosed"),
                        title: cfstr("AXTitle"),
                        cmd_char: cfstr("AXMenuItemCmdChar"),
                        cmd_mods: cfstr("AXMenuItemCmdModifiers"),
                        cmd_glyph: cfstr("AXMenuItemCmdGlyph"),
                        position: cfstr("AXPosition"),
                        size: cfstr("AXSize"),
                    },
                    bundle_id: String::new(),
                    highlight: None,
                    pending: None,
                    tracker: Tracker::default(),
                })
            });
            let own = std::process::id() as i32;
            let mut current: Option<Observing> = None;
            let mut last_wanted: Option<bool> = None;
            loop {
                let wanted = engine.settings.read().unwrap().menu_tips && super::context::accessibility_granted();
                if std::env::var_os("CMDNUDGE_DEBUG").is_some() && last_wanted != Some(wanted) {
                    eprintln!("menus: observing={wanted} (setting {}, accessibility {})", engine.settings.read().unwrap().menu_tips, super::context::accessibility_granted());
                }
                last_wanted = Some(wanted);
                let front = if wanted {
                    NSWorkspace::sharedWorkspace().frontmostApplication().map(|a| {
                        (a.processIdentifier(), a.bundleIdentifier().map(|s| s.to_string()).unwrap_or_default())
                    })
                } else {
                    None
                };
                let target = front.filter(|(pid, _)| *pid > 0 && *pid != own);
                if current.as_ref().map(|o| o.pid) != target.as_ref().map(|t| t.0) {
                    if let Some(o) = current.take() {
                        unsafe { stop(o) };
                    }
                    STATE.with(|cell| {
                        if let Some(st) = cell.borrow_mut().as_mut() {
                            st.highlight = None;
                            st.bundle_id = target.as_ref().map(|t| t.1.clone()).unwrap_or_default();
                        }
                    });
                    if let Some((pid, _)) = target {
                        current = unsafe { observe(pid) };
                    }
                }
                if current.is_some() {
                    // Delivers the observer callbacks; short, so a pending pick is decided promptly.
                    unsafe { CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.15, false) };
                    let debug = std::env::var_os("CMDNUDGE_DEBUG").is_some();
                    STATE.with(|cell| {
                        if let Some(st) = cell.borrow_mut().as_mut() {
                            settle(st, debug);
                        }
                    });
                } else {
                    // No source in the run loop: it would return at once, so just wait.
                    std::thread::sleep(std::time::Duration::from_millis(700));
                }
            }
        })
        .expect("spawn the menu watcher");
}
