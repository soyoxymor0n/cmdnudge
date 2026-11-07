//! Windows recorder (#17), capture side: a low-level keyboard hook that counts the library's
//! Windows shortcuts per app family. It never blocks, changes or shows anything (D10); it only
//! counts, and the counts reach the Mac through sync.
//!
//! Privacy: the hook callback turns a key-down into chord text and drops it unless it is one
//! of the library's habit chords (`Recorder::is_habit_chord`). Only a matching chord crosses to
//! the worker thread, which then looks up the foreground app's executable name, maps it to a
//! family and hands (family, action) on. No key text, window title or path is stored.

#![allow(unsafe_op_in_unsafe_fn)]

use crate::win_recorder::{chord_text, key_name, Recorder, WinMods};
use std::sync::mpsc::{channel, Sender};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use windows_sys::Win32::Foundation::{CloseHandle, LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VK_CONTROL, VK_LCONTROL, VK_LMENU, VK_LSHIFT, VK_LWIN, VK_MENU, VK_RCONTROL, VK_RMENU, VK_RSHIFT, VK_RWIN, VK_SHIFT,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetForegroundWindow, GetMessageW, GetWindowThreadProcessId, SetWindowsHookExW, TranslateMessage, KBDLLHOOKSTRUCT,
    LLKHF_INJECTED, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
};

static RECORDER: OnceLock<Recorder> = OnceLock::new();
static SENDER: OnceLock<Mutex<Sender<String>>> = OnceLock::new();
/// The key currently held, so auto-repeat counts once.
static HELD: Mutex<u32> = Mutex::new(0);
/// True once the low-level hook is installed (read by the Windows CI test).
static HOOK_READY: AtomicBool = AtomicBool::new(false);

fn down(vk: u16) -> bool {
    unsafe { (GetAsyncKeyState(vk as i32) as u16 & 0x8000) != 0 }
}

fn is_modifier(vk: u32) -> bool {
    [VK_SHIFT, VK_CONTROL, VK_MENU, VK_LSHIFT, VK_RSHIFT, VK_LCONTROL, VK_RCONTROL, VK_LMENU, VK_RMENU, VK_LWIN, VK_RWIN]
        .iter()
        .any(|m| *m as u32 == vk)
}

fn modifiers() -> WinMods {
    // AltGr arrives as left Ctrl + right Alt; count it as AltGr, not as Ctrl+Alt.
    let altgr = down(VK_RMENU);
    WinMods {
        ctrl: if altgr { down(VK_RCONTROL) } else { down(VK_LCONTROL) || down(VK_RCONTROL) },
        shift: down(VK_LSHIFT) || down(VK_RSHIFT),
        alt: down(VK_LMENU),
        win: down(VK_LWIN) || down(VK_RWIN),
        altgr,
    }
}

/// One key event as the hook sees it. `mods` is only asked for on a fresh, physical, non-modifier
/// key-down, so ordinary key-ups and repeats cost nothing.
fn on_key(vk: u32, msg: u32, flags: u32, mods: impl FnOnce() -> WinMods) {
    if msg == WM_KEYUP || msg == WM_SYSKEYUP {
        let mut held = HELD.lock().unwrap();
        if *held == vk {
            *held = 0;
        }
    } else if (msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN) && flags & LLKHF_INJECTED == 0 && !is_modifier(vk) {
        let repeat = {
            let mut held = HELD.lock().unwrap();
            let r = *held == vk;
            *held = vk;
            r
        };
        if !repeat {
            if let (Some(key), Some(rec)) = (key_name(vk), RECORDER.get()) {
                let chord = chord_text(mods(), &key);
                if rec.is_habit_chord(&chord) {
                    if let Some(tx) = SENDER.get() {
                        let _ = tx.lock().unwrap().send(chord);
                    }
                }
            }
        }
    }
}

unsafe extern "system" fn hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        let k = &*(lparam as *const KBDLLHOOKSTRUCT);
        on_key(k.vkCode, wparam as u32, k.flags, modifiers);
    }
    // Always pass the key on: the recorder only watches.
    CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
}

/// The foreground window's executable file name ("chrome.exe"), or None.
fn foreground_exe() -> Option<String> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == 0 {
            return None;
        }
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if process.is_null() {
            return None;
        }
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, buf.as_mut_ptr(), &mut len) != 0;
        CloseHandle(process);
        if !ok {
            return None;
        }
        let path = String::from_utf16_lossy(&buf[..len as usize]);
        path.rsplit('\\').next().map(str::to_string)
    }
}

/// Starts the hook thread (with its message loop, which low-level hooks need) and the worker
/// that turns a chord into (family, action) and calls `on_use`.
pub fn start(recorder: Recorder, on_use: impl Fn(&str, &str) + Send + 'static) {
    if RECORDER.set(recorder).is_err() {
        return;
    }
    let (tx, rx) = channel::<String>();
    let _ = SENDER.set(Mutex::new(tx));
    std::thread::Builder::new()
        .name("cmdnudge-win-worker".into())
        .spawn(move || {
            let rec = RECORDER.get().expect("set above");
            for chord in rx {
                let exe = foreground_exe().unwrap_or_default();
                let family = rec.family_of_exe(&exe).to_string();
                if let Some(action) = rec.action_for(&chord, &family) {
                    on_use(&family, action);
                }
            }
        })
        .expect("spawn the Windows recorder worker");
    std::thread::Builder::new()
        .name("cmdnudge-win-hook".into())
        .spawn(|| unsafe {
            let h = SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook), std::ptr::null_mut(), 0);
            if h.is_null() {
                return;
            }
            HOOK_READY.store(true, Ordering::SeqCst);
            let mut msg: MSG = std::mem::zeroed();
            while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        })
        .expect("spawn the Windows keyboard hook");
}

#[cfg(test)]
mod tests {
    //! Runs on the windows-latest CI runner: the real hook installation, the real worker thread
    //! and the real foreground-app lookup. Key events are fed through the same function the hook
    //! calls, with the modifier state given, so no input is injected into the runner's desktop.
    use super::*;
    use crate::library;
    use std::sync::mpsc;
    use std::time::{Duration, Instant};

    const C: u32 = b'C' as u32;
    const Q: u32 = b'Q' as u32;

    fn ctrl() -> WinMods {
        WinMods { ctrl: true, ..Default::default() }
    }

    #[test]
    fn hook_installs_and_counts_only_physical_habit_chords_once() {
        let (tx, rx) = mpsc::channel::<(String, String)>();
        start(Recorder::new(library::get()), move |family, action| {
            let _ = tx.send((family.to_string(), action.to_string()));
        });
        let t = Instant::now();
        while !HOOK_READY.load(Ordering::SeqCst) && t.elapsed() < Duration::from_secs(3) {
            std::thread::sleep(Duration::from_millis(20));
        }
        assert!(HOOK_READY.load(Ordering::SeqCst), "SetWindowsHookExW(WH_KEYBOARD_LL) failed");
        let quiet = |what: &str| assert!(rx.recv_timeout(Duration::from_millis(400)).is_err(), "{what} was counted");

        // Synthetic input (another program, a remote tool) is never counted.
        on_key(C, WM_KEYDOWN, LLKHF_INJECTED, ctrl);
        on_key(C, WM_KEYUP, LLKHF_INJECTED, ctrl);
        quiet("an injected Ctrl+C");

        // A physical Ctrl+C, held long enough to auto-repeat: one use, through the worker and
        // the foreground-app lookup.
        on_key(C, WM_KEYDOWN, 0, ctrl);
        on_key(C, WM_KEYDOWN, 0, ctrl);
        on_key(C, WM_KEYUP, 0, ctrl);
        let (family, action) = rx.recv_timeout(Duration::from_secs(2)).expect("a physical Ctrl+C was not counted");
        assert_eq!(action, "edit.copy");
        eprintln!("hook installed; physical Ctrl+C counted as {action} in family {family}");
        quiet("the auto-repeat");

        // Pressed again after release: a second use.
        on_key(C, WM_KEYDOWN, 0, ctrl);
        on_key(C, WM_KEYUP, 0, ctrl);
        assert!(rx.recv_timeout(Duration::from_secs(2)).is_ok(), "a second Ctrl+C was not counted");

        // Plain typing, capitals included, never leaves the hook.
        on_key(Q, WM_KEYDOWN, 0, WinMods::default);
        on_key(Q, WM_KEYUP, 0, WinMods::default);
        quiet("a plain letter");
        on_key(Q, WM_KEYDOWN, 0, || WinMods { shift: true, ..Default::default() });
        on_key(Q, WM_KEYUP, 0, || WinMods { shift: true, ..Default::default() });
        quiet("Shift+Q");
    }
}
