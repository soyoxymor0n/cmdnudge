// Keyboard layouts: Mac keycaps and the typing habits Windows AltGr muscle memory brings along.
// Inputs: src/layouts.json (authored), src/mac-layouts.json (measured on macOS by
// tools/dump-mac-layouts.swift) and src/windows-altgr.json (imported from the Windows .klc
// files by tools/import-klc.mjs). Nothing here is typed in by hand.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(readFileSync(join(root, 'src', f), 'utf8'));

/** Physical key (KeyboardEvent.code) -> Mac virtual key code as UCKeyTranslate sees it on ISO. */
export const MAC_KEYCODE = {
  KeyA: 0, KeyS: 1, KeyD: 2, KeyF: 3, KeyH: 4, KeyG: 5, KeyZ: 6, KeyX: 7, KeyC: 8, KeyV: 9, Backquote: 10,
  KeyB: 11, KeyQ: 12, KeyW: 13, KeyE: 14, KeyR: 15, KeyY: 16, KeyT: 17, Digit1: 18, Digit2: 19, Digit3: 20,
  Digit4: 21, Digit6: 22, Digit5: 23, Equal: 24, Digit9: 25, Digit7: 26, Minus: 27, Digit8: 28, Digit0: 29,
  BracketRight: 30, KeyO: 31, KeyU: 32, BracketLeft: 33, KeyI: 34, KeyP: 35, KeyL: 37, KeyJ: 38, Quote: 39,
  KeyK: 40, Semicolon: 41, Backslash: 42, Comma: 43, Slash: 44, KeyN: 45, KeyM: 46, Period: 47, IntlBackslash: 50,
};

/** Characters people type with AltGr on Windows, and the action id each one gets. */
export const TEACH = {
  '@': 'at-sign', '€': 'euro', '{': 'brace-open', '}': 'brace-close', '[': 'bracket-open', ']': 'bracket-close',
  '\\': 'backslash', '|': 'pipe', '~': 'tilde', 'µ': 'micro', '#': 'hash', '`': 'backtick', '^': 'caret',
  '<': 'less-than', '>': 'greater-than', '$': 'dollar', '£': 'pound', '&': 'ampersand',
  'ą': 'a-ogonek', 'ć': 'c-acute', 'ę': 'e-ogonek', 'ł': 'l-stroke', 'ń': 'n-acute', 'ó': 'o-acute',
  'ś': 's-acute', 'ź': 'z-acute', 'ż': 'z-dot',
};

/** Letters taught only on the Polish layout; elsewhere AltGr+O for ó is not a habit we know of. */
const POLISH = new Set(['ą', 'ć', 'ę', 'ł', 'ń', 'ó', 'ś', 'ź', 'ż']);

const NAMED = { '+': 'plus', '-': 'minus', ',': 'comma', '.': 'period' };

/**
 * The keycap label of a Mac key, the same rule keymap.rs applies at runtime: the unshifted
 * character, except on number rows like AZERTY where the digit is on Shift (habits say "ctrl+1").
 * Returns null for keys that type nothing printable (return, tab, space).
 */
export function keyLabel(row) {
  const [base, shift] = row;
  if (!base || /^[\s\x00-\x1f]$/.test(base)) return null;
  if (/^[0-9]$/.test(shift) && !/\p{L}/u.test(base)) return shift;
  const b = base.toLowerCase();
  return NAMED[b] ?? b;
}

const MODS = ['', 'shift+', 'opt+', 'opt+shift+'];

export function loadLayouts() {
  const { layouts } = read('layouts.json');
  const mac = read('mac-layouts.json').layouts;
  const win = read('windows-altgr.json').layouts;
  return { layouts, mac, win };
}

/** KeyboardEvent.code -> keycap label for one Mac layout. */
export function keycaps(macLayout) {
  const out = {};
  for (const [code, kc] of Object.entries(MAC_KEYCODE)) {
    const l = keyLabel(macLayout[kc]);
    if (l) out[code] = l;
  }
  return out;
}

/**
 * The easiest Mac chord that types ch: plain, Shift, Option, Option+Shift. Within a layer the
 * key the Windows habit used wins (Polish ń is ⌥N and also ⌥F; ⌥N is the one to teach).
 */
export function macChord(macLayout, ch, prefer = -1) {
  for (let layer = 0; layer < 4; layer++) {
    for (const kc of [prefer, ...Array.from({ length: 51 }, (_, i) => i)]) {
      const row = macLayout[kc];
      if (!row || row[layer] !== ch) continue;
      const label = keyLabel(row);
      if (label) return MODS[layer] + label;
    }
  }
  return null;
}

/**
 * Typing habits for one layout: every TEACH character the Windows layout puts on AltGr becomes
 * "altgr+<the Mac keycap at that physical key>" -> the Mac chord that types the character.
 */
export function typingHabits(entry, mac, win) {
  if (!entry.windows) return { habits: [], skipped: [] };
  const m = mac[entry.mac[0]];
  const w = win[entry.windows];
  const caps = keycaps(m);
  const habits = [];
  const skipped = [];
  for (const [layer, prefix] of [['altgr', 'altgr+'], ['shiftAltgr', 'altgr+shift+']]) {
    for (const [code, ch] of Object.entries(w[layer])) {
      const name = TEACH[ch];
      if (!name) continue;
      const cap = caps[code];
      if (POLISH.has(ch) && entry.id !== 'pl') continue; // accented letters only where the layout is about them
      const chord = macChord(m, ch, MAC_KEYCODE[code]);
      if (!cap || !chord) { skipped.push({ layout: entry.id, ch, code, why: !cap ? 'no keycap' : 'not on the Mac layout' }); continue; }
      if (habits.some((h) => h.label === ch)) continue; // a second AltGr key for the same character (pt "]")
      habits.push({
        id: entry.id === 'de' ? name : `${name}-${entry.id}`,
        action: `type.${name}`, label: ch, category: 'typing', family: 'system', layouts: [entry.id],
        windows: prefix + cap, mac: [chord], guard: true,
        sourceURL: `https://developer.apple.com/documentation/coreservices/1390584-uckeytranslate`,
        windowsSourceURL: w.source,
      });
    }
  }
  return { habits, skipped };
}
