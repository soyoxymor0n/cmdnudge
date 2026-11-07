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

unsafe extern "system" fn hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        let k = &*(lparam as *const KBDLLHOOKSTRUCT);
        let msg = wparam as u32;
        if msg == WM_KEYUP || msg == WM_SYSKEYUP {
            let mut held = HELD.lock().unwrap();
            if *held == k.vkCode {
                *held = 0;
            }
        } else if (msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN) && k.flags & LLKHF_INJECTED == 0 && !is_modifier(k.vkCode) {
            let repeat = {
                let mut held = HELD.lock().unwrap();
                let r = *held == k.vkCode;
                *held = k.vkCode;
                r
            };
            if !repeat {
                if let (Some(key), Some(rec)) = (key_name(k.vkCode), RECORDER.get()) {
                    let chord = chord_text(modifiers(), &key);
                    if rec.is_habit_chord(&chord) {
                        if let Some(tx) = SENDER.get() {
                            let _ = tx.lock().unwrap().send(chord);
                        }
                    }
                }
            }
        }
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
    //! Runs on the windows-latest CI runner: the real hook, the real worker, the real foreground
    //! lookup. Only the physical key press is simulated, by calling the hook the way Windows does.
    use super::*;
    use crate::library;
    use std::sync::mpsc;
    use std::time::{Duration, Instant};
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP};

    fn key(vk: u16, up: bool) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: vk, wScan: 0, dwFlags: if up { KEYEVENTF_KEYUP } else { 0 }, time: 0, dwExtraInfo: 0 } },
        }
    }

    fn send(keys: &[INPUT]) -> u32 {
        unsafe { SendInput(keys.len() as u32, keys.as_ptr(), std::mem::size_of::<INPUT>() as i32) }
    }

    fn physical(vk: u32, msg: u32) {
        let k = KBDLLHOOKSTRUCT { vkCode: vk, scanCode: 0, flags: 0, time: 0, dwExtraInfo: 0 };
        unsafe { hook(0, msg as WPARAM, &k as *const KBDLLHOOKSTRUCT as LPARAM) };
    }

    #[test]
    fn hook_installs_skips_injected_keys_and_counts_a_physical_chord() {
        let (tx, rx) = mpsc::channel::<(String, String)>();
        start(Recorder::new(library::get()), move |family, action| {
            let _ = tx.send((family.to_string(), action.to_string()));
        });
        let t = Instant::now();
        while !HOOK_READY.load(Ordering::SeqCst) && t.elapsed() < Duration::from_secs(3) {
            std::thread::sleep(Duration::from_millis(20));
        }
        assert!(HOOK_READY.load(Ordering::SeqCst), "SetWindowsHookExW(WH_KEYBOARD_LL) failed");

        // Synthetic input (another program, a remote tool, cmdnudge itself) is never counted.
        let c = b'C' as u16;
        let ctrl = VK_LCONTROL;
        if send(&[key(ctrl, false), key(c, false), key(c, true), key(ctrl, true)]) == 4 {
            assert!(rx.recv_timeout(Duration::from_millis(800)).is_err(), "an injected Ctrl+C was counted");
        } else {
            eprintln!("SendInput blocked on this runner; injected-key check skipped");
        }

        // A physical Ctrl+C: Ctrl held, then the hook sees C the way Windows delivers it.
        send(&[key(ctrl, false)]);
        std::thread::sleep(Duration::from_millis(100));
        if !down(ctrl) {
            send(&[key(ctrl, true)]);
            eprintln!("no interactive input desktop on this runner; physical-chord check skipped");
            return;
        }
        physical(c as u32, WM_KEYDOWN);
        physical(c as u32, WM_KEYDOWN); // auto-repeat: still one use
        physical(c as u32, WM_KEYUP);
        send(&[key(ctrl, true)]);
        let (family, action) = rx.recv_timeout(Duration::from_secs(2)).expect("a physical Ctrl+C was not counted");
        assert_eq!(action, "edit.copy");
        eprintln!("counted Ctrl+C as {action} in family {family}");
        assert!(rx.recv_timeout(Duration::from_millis(500)).is_err(), "auto-repeat counted twice");

        // Plain typing never leaves the hook.
        physical(b'Q' as u32, WM_KEYDOWN);
        physical(b'Q' as u32, WM_KEYUP);
        assert!(rx.recv_timeout(Duration::from_millis(500)).is_err(), "a plain letter was counted");
    }
}
