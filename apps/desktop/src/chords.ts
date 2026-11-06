// Display helpers mirroring packages/library/lib/chord.mjs.
const MAC: Record<string, string> = { ctrl: "⌃", opt: "⌥", lopt: "⌥", ropt: "⌥", shift: "⇧", cmd: "⌘", lcmd: "⌘", rcmd: "⌘" };
const KEY: Record<string, string> = {
  left: "←", right: "→", up: "↑", down: "↓", backspace: "⌫", fwddelete: "⌦", return: "↩", esc: "⎋", tab: "⇥",
  space: "Space", home: "↖", end: "↘", pageup: "⇞", pagedown: "⇟", plus: "+", minus: "-", period: ".", comma: ",",
};
const WKEY: Record<string, string> = { ...KEY, backspace: "Backspace", fwddelete: "Del", return: "Enter", esc: "Esc", tab: "Tab", home: "Home", end: "End" };
const WMOD: Record<string, string> = { ctrl: "Ctrl", win: "Win", alt: "Alt", altgr: "AltGr", shift: "Shift" };
const label = (k: string, t: Record<string, string>) => t[k] ?? (k.length === 1 || /^f\d+$/.test(k) ? k.toUpperCase() : k);

export function mac(chord: string, sided = false): string {
  const parts = chord.split("+");
  const key = parts.pop()!;
  const order = ["ctrl", "opt", "lopt", "ropt", "shift", "cmd", "lcmd", "rcmd"];
  parts.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const side = sided && parts.some((p) => p === "rcmd" || p === "ropt") ? "right " : sided && parts.some((p) => p === "lcmd" || p === "lopt") ? "left " : "";
  return side + parts.map((p) => MAC[p]).join("") + label(key, KEY);
}

export function win(chord: string): string {
  const parts = chord.split("+");
  const key = parts.pop()!;
  return [...parts.map((p) => WMOD[p] ?? p), label(key, WKEY)].join("+");
}
