//! The event tap: macOS hands us every key-down; we keep only key combinations
//! (filter.rs) and forget the rest inside this callback.

use super::context;
use super::ffi::*;
use crate::chord::{Chord, Mods};
use crate::engine::{Decision, Engine};
use crate::filter::{is_key_combo, Held};
use crate::keymap;
use std::ffi::c_void;
use std::sync::atomic::{AtomicPtr, AtomicU8, Ordering};

/// 0 = not running, 1 = listen-only (no guard), 2 = active (can block).
pub static TAP_STATE: AtomicU8 = AtomicU8::new(0);
static TAP_PORT: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());
static ENGINE: AtomicPtr<Engine> = AtomicPtr::new(std::ptr::null_mut());

/// Marks events we synthesize ourselves (translate mode), so the tap ignores them.
const OUR_EVENTS: i64 = 0x636D_646E; // "cmdn"

fn mods_from_flags(flags: u64) -> Mods {
    let cmd = flags & K_CG_EVENT_FLAG_MASK_COMMAND != 0;
    let opt = flags & K_CG_EVENT_FLAG_MASK_ALTERNATE != 0;
    let mut m = Mods {
        ctrl: flags & K_CG_EVENT_FLAG_MASK_CONTROL != 0,
        shift: flags & K_CG_EVENT_FLAG_MASK_SHIFT != 0,
        lcmd: cmd && flags & NX_DEVICELCMDKEYMASK != 0,
        rcmd: cmd && flags & NX_DEVICERCMDKEYMASK != 0,
        lopt: opt && flags & NX_DEVICELALTKEYMASK != 0,
        ropt: opt && flags & NX_DEVICERALTKEYMASK != 0,
    };
    // Synthetic events may carry the generic bit without a side; treat them as left.
    if cmd && !m.lcmd && !m.rcmd {
        m.lcmd = true;
    }
    if opt && !m.lopt && !m.ropt {
        m.lopt = true;
    }
    m
}

extern "C" fn callback(_proxy: *mut c_void, kind: u32, event: CGEventRef, _info: *mut c_void) -> CGEventRef {
    unsafe {
        if kind == K_CG_EVENT_TAP_DISABLED_BY_TIMEOUT || kind == K_CG_EVENT_TAP_DISABLED_BY_USER_INPUT {
            let port = TAP_PORT.load(Ordering::Relaxed);
            if !port.is_null() {
                CGEventTapEnable(port, true);
            }
            return event;
        }
        if kind != K_CG_EVENT_KEY_DOWN {
            return event;
        }
        if CGEventGetIntegerValueField(event, K_CG_EVENT_SOURCE_USER_DATA) == OUR_EVENTS {
            return event;
        }
        // Password fields: macOS normally hides these from taps; we also refuse to look.
        if IsSecureEventInputEnabled() != 0 {
            return event;
        }
        let key = CGEventGetIntegerValueField(event, K_CG_KEYBOARD_EVENT_KEYCODE) as u16;
        let mods = mods_from_flags(CGEventGetFlags(event));
        let held = Held { cmd: mods.cmd(), ctrl: mods.ctrl, opt: mods.opt(), shift: mods.shift };
        // ---- The privacy filter. Anything that is not a key combination ends here. ----
        if !is_key_combo(held, key) {
            return event;
        }
        let Some(engine) = ENGINE.load(Ordering::Relaxed).as_ref() else { return event };
        let layout = engine.layout();
        let Some(label) = keymap::label(key, layout) else { return event };
        let chord = Chord { mods, key: label.to_string() };
        let repeat = CGEventGetIntegerValueField(event, K_CG_KEYBOARD_EVENT_AUTOREPEAT) != 0;
        let app = context::frontmost_app();
        let active = TAP_STATE.load(Ordering::Relaxed) == 2;
        match engine.on_key(&chord, &app.bundle_id, &app.name, repeat) {
            Decision::Block if active => std::ptr::null_mut(),
            Decision::Replace(p) if active => {
                if let Some(code) = keymap::keycode(&p.key, layout) {
                    post_chord(code, p.as_mods());
                    std::ptr::null_mut()
                } else {
                    event
                }
            }
            _ => event,
        }
    }
}

unsafe fn post_chord(keycode: u16, m: Mods) {
    unsafe {
        let mut flags = 0u64;
        if m.ctrl {
            flags |= K_CG_EVENT_FLAG_MASK_CONTROL;
        }
        if m.shift {
            flags |= K_CG_EVENT_FLAG_MASK_SHIFT;
        }
        if m.lopt || m.ropt {
            flags |= K_CG_EVENT_FLAG_MASK_ALTERNATE;
        }
        if m.lcmd || m.rcmd {
            flags |= K_CG_EVENT_FLAG_MASK_COMMAND;
        }
        for down in [true, false] {
            let e = CGEventCreateKeyboardEvent(std::ptr::null_mut(), keycode, down);
            if e.is_null() {
                continue;
            }
            CGEventSetFlags(e, flags);
            CGEventSetIntegerValueField(e, K_CG_EVENT_SOURCE_USER_DATA, OUR_EVENTS);
            CGEventPost(K_CG_SESSION_EVENT_TAP, e);
            CFRelease(e as *const c_void);
        }
    }
}

/// Starts the tap thread. It retries until a permission is granted, so onboarding
/// does not need an app restart.
pub fn start(engine: &'static Engine) {
    ENGINE.store(engine as *const Engine as *mut Engine, Ordering::Relaxed);
    std::thread::Builder::new()
        .name("cmdnudge-tap".into())
        .spawn(|| loop {
            let trusted = unsafe { AXIsProcessTrusted() };
            let options = if trusted { K_CG_EVENT_TAP_OPTION_DEFAULT } else { K_CG_EVENT_TAP_OPTION_LISTEN_ONLY };
            let port = unsafe {
                CGEventTapCreate(
                    K_CG_SESSION_EVENT_TAP,
                    K_CG_HEAD_INSERT_EVENT_TAP,
                    options,
                    1 << K_CG_EVENT_KEY_DOWN,
                    callback,
                    std::ptr::null_mut(),
                )
            };
            if port.is_null() {
                TAP_STATE.store(0, Ordering::Relaxed);
                std::thread::sleep(std::time::Duration::from_secs(2));
                continue;
            }
            TAP_PORT.store(port, Ordering::Relaxed);
            TAP_STATE.store(if trusted { 2 } else { 1 }, Ordering::Relaxed);
            unsafe {
                let source = CFMachPortCreateRunLoopSource(std::ptr::null(), port, 0);
                let rl = CFRunLoopGetCurrent();
                CFRunLoopAddSource(rl, source, kCFRunLoopCommonModes);
                CGEventTapEnable(port, true);
                if trusted {
                    // Active tap: runs until the app quits.
                    CFRunLoopRun();
                } else {
                    // Listen-only: check every few seconds whether Accessibility was granted
                    // meanwhile, and upgrade to an active tap so the guard can work.
                    while !AXIsProcessTrusted() {
                        CFRunLoopRunInMode(kCFRunLoopDefaultMode, 3.0, false);
                    }
                    CGEventTapEnable(port, false);
                    CFRunLoopRemoveSource(rl, source, kCFRunLoopCommonModes);
                    CFMachPortInvalidate(port);
                    CFRelease(source);
                    CFRelease(port);
                    TAP_PORT.store(std::ptr::null_mut(), Ordering::Relaxed);
                }
            }
        })
        .expect("tap thread");
}
