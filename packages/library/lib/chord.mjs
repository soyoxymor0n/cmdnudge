// Chord strings shared by the generator, the checker and the landing page playground.
// A chord is "mod+mod+key". Mac modifiers: ctrl, opt|lopt|ropt, shift, cmd|lcmd|rcmd.
// Windows modifiers: ctrl, alt, altgr, shift, win. Keys are the label printed on the keycap
// in the active layout (so "z" on a German keyboard is the key labelled Z).

export const MAC_MODS = ['ctrl', 'opt', 'lopt', 'ropt', 'shift', 'cmd', 'lcmd', 'rcmd'];
export const WIN_MODS = ['ctrl', 'win', 'alt', 'altgr', 'shift'];
const MAC_ORDER = { ctrl: 0, opt: 1, lopt: 1, ropt: 1, shift: 2, cmd: 3, lcmd: 3, rcmd: 3 };
const WIN_ORDER = { ctrl: 0, win: 1, alt: 2, altgr: 2, shift: 3 };

export function parse(chord, platform = 'mac') {
  const parts = chord.split('+');
  const key = parts.pop();
  const allowed = platform === 'mac' ? MAC_MODS : WIN_MODS;
  for (const m of parts) if (!allowed.includes(m)) throw new Error(`unknown ${platform} modifier "${m}" in "${chord}"`);
  if (!key) throw new Error(`no key in "${chord}"`);
  if (new Set(parts).size !== parts.length) throw new Error(`duplicate modifier in "${chord}"`);
  return { mods: parts, key };
}

export function normalize(chord, platform = 'mac') {
  const { mods, key } = parse(chord, platform);
  const order = platform === 'mac' ? MAC_ORDER : WIN_ORDER;
  return [...mods].sort((a, b) => order[a] - order[b]).concat(key).join('+');
}

/** Side-agnostic form: lcmd/rcmd -> cmd, lopt/ropt -> opt. */
export function loose(chord) {
  return normalize(chord.split('+').map((t, i, a) => (i < a.length - 1 ? t.replace(/^[lr](cmd|opt)$/, '$1') : t)).join('+'));
}

/** Does a pressed (sided) mac chord satisfy a pattern? "cmd" matches either side; "rcmd" only the right one. */
export function matches(pattern, pressed) {
  const p = parse(pattern), q = parse(pressed);
  if (p.key !== q.key || p.mods.length !== q.mods.length) return false;
  return p.mods.every((m) => q.mods.some((n) => n === m || (m === 'cmd' && /cmd$/.test(n)) || (m === 'opt' && /opt$/.test(n)) || (n === 'cmd' && /cmd$/.test(m)) || (n === 'opt' && /opt$/.test(m))));
}

/** Where a Windows modifier lands when the same physical key is pressed on a Mac keyboard. */
export const MOD_MAP = {
  // Apple keyboard: bottom row is fn ctrl opt cmd [space] cmd opt. Windows: ctrl win alt [space] altgr.
  apple: { ctrl: 'ctrl', win: 'opt', alt: 'lcmd', altgr: 'rcmd', shift: 'shift' },
  // PC keyboard on a Mac: the Win key acts as cmd, Alt as opt, AltGr as right opt.
  pc: { ctrl: 'ctrl', win: 'cmd', alt: 'lopt', altgr: 'ropt', shift: 'shift' },
};

export function arrive(winChord, keyboard) {
  const { mods, key } = parse(winChord, 'win');
  return normalize(mods.map((m) => MOD_MAP[keyboard][m]).concat(key).join('+'));
}

const MAC_SYM = { ctrl: '⌃', opt: '⌥', lopt: '⌥', ropt: '⌥', shift: '⇧', cmd: '⌘', lcmd: '⌘', rcmd: '⌘' };
const KEY_SYM = {
  left: '←', right: '→', up: '↑', down: '↓', backspace: '⌫', fwddelete: '⌦', return: '↩', esc: '⎋', tab: '⇥',
  space: 'Space', home: '↖', end: '↘', pageup: '⇞', pagedown: '⇟', plus: '+', minus: '-', period: '.', comma: ',',
};
const WIN_KEY = {
  left: '←', right: '→', up: '↑', down: '↓', backspace: 'Backspace', fwddelete: 'Del', return: 'Enter', esc: 'Esc', tab: 'Tab',
  space: 'Space', home: 'Home', end: 'End', pageup: 'PgUp', pagedown: 'PgDn', plus: '+', minus: '-', period: '.', comma: ',',
};
const WIN_MOD = { ctrl: 'Ctrl', win: 'Win', alt: 'Alt', altgr: 'AltGr', shift: 'Shift' };

function keyLabel(key, table) {
  if (table[key]) return table[key];
  if (/^f\d+$/.test(key)) return key.toUpperCase();
  return key.length === 1 ? key.toUpperCase() : key;
}

/** "opt+cmd+space" -> "⌥⌘Space"; "rcmd+q" -> "right ⌘Q" when sided=true. */
export function formatMac(chord, { sided = false } = {}) {
  const { mods, key } = parse(normalize(chord));
  const side = sided && mods.find((m) => /^r(cmd|opt)$/.test(m)) ? 'right ' : '';
  return side + mods.map((m) => MAC_SYM[m]).join('') + keyLabel(key, KEY_SYM);
}

export function formatWin(chord) {
  const { mods, key } = parse(chord, 'win');
  return mods.map((m) => WIN_MOD[m]).concat(keyLabel(key, WIN_KEY)).join('+');
}
