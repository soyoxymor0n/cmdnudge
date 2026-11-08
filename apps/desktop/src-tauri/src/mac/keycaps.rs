//! Reads the keycaps of the active keyboard layout with UCKeyTranslate (#33), so shortcuts
//! resolve on any layout, not only the ones with a static table. Call on the main thread.

use super::ffi::*;
use std::ffi::c_void;

const K_UC_KEY_ACTION_DOWN: u16 = 0;
const K_UC_KEY_TRANSLATE_NO_DEAD_KEYS_MASK: u32 = 1;
const SHIFT_KEY_STATE: u32 = 0x02; // shiftKey >> 8
const K_KEYBOARD_ISO: u32 = 0x4953_4F20; // 'ISO '

/// (keycode, base, shift) for the typing block (0..=50) of the current layout, or empty.
pub fn current() -> Vec<(u16, String, String)> {
    unsafe {
        let src = TISCopyCurrentKeyboardLayoutInputSource();
        if src.is_null() {
            return Vec::new();
        }
        let data = TISGetInputSourceProperty(src, kTISPropertyUnicodeKeyLayoutData);
        let out = if data.is_null() { Vec::new() } else { read(CFDataGetBytePtr(data) as *const c_void) };
        CFRelease(src as *const c_void);
        out
    }
}

unsafe fn read(layout: *const c_void) -> Vec<(u16, String, String)> {
    let kbd = unsafe { LMGetKbdType() } as u32;
    // On ISO keyboards the key left of 1 and the key right of left Shift arrive with the
    // codes swapped relative to what UCKeyTranslate assumes (verified with the Key check).
    let iso = unsafe { KBGetLayoutType(kbd as i16) } == K_KEYBOARD_ISO;
    let tr = |code: u16, mods: u32| -> String {
        let mut dead = 0u32;
        let mut len = 0usize;
        let mut buf = [0u16; 4];
        let r = unsafe {
            UCKeyTranslate(layout, code, K_UC_KEY_ACTION_DOWN, mods, kbd, K_UC_KEY_TRANSLATE_NO_DEAD_KEYS_MASK, &mut dead, 4, &mut len, buf.as_mut_ptr())
        };
        if r != 0 { String::new() } else { String::from_utf16_lossy(&buf[..len]) }
    };
    (0u16..=50)
        .map(|code| {
            let hw = match (iso, code) {
                (true, 10) => 50,
                (true, 50) => 10,
                _ => code,
            };
            (hw, tr(code, 0), tr(code, SHIFT_KEY_STATE))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    /// Reads the real active layout; run by hand: cargo test reads_the_active_layout -- --ignored
    #[test]
    #[ignore]
    fn reads_the_active_layout() {
        let keys = super::current();
        assert_eq!(keys.len(), 51);
        crate::keymap::set_runtime(&keys);
        for code in [0u16, 6, 10, 12, 16, 18, 24, 27, 30, 50] {
            eprintln!("{code:>2} -> {:?}", crate::keymap::label(code, crate::keymap::Layout::Other));
        }
        assert!(crate::keymap::label(0, crate::keymap::Layout::Other).is_some());
    }
}
