import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../tools/generate.mjs';
import { check } from '../tools/check.mjs';
import { arrive, formatMac, formatWin, matches, normalize } from '../lib/chord.mjs';
import { loadLayouts, typingHabits } from '../tools/layouts.mjs';

const lib = build();
const rule = (habit, layout, keyboard) => lib.habitRules.find((r) => r.habit === habit && r.layout === layout && r.keyboard === keyboard);
const drop = (habit, layout, keyboard) => lib.dropped.find((r) => r.habit === habit && r.layout === layout && r.keyboard === keyboard);

test('checker is green', () => assert.deepEqual(check(lib), []));
test('at least 50 habits', () => assert.ok(lib.habits.length >= 50));

test('AltGr+Q on an Apple keyboard with German QWERTZ arrives as right ⌘Q and is guarded', () => {
  const r = rule('at-sign', 'de', 'apple');
  assert.equal(r.arrives, 'rcmd+q');
  assert.equal(r.guard, true);
  assert.deepEqual(r.mac, ['opt+l']);
  assert.equal(rule('at-sign', 'us', 'apple'), undefined, 'US has no AltGr habit');
});

test('PC keyboard: AltGr+Q arrives as right ⌥Q, hinted but never guarded', () => {
  const r = rule('at-sign', 'de', 'pc');
  assert.equal(r.arrives, 'ropt+q');
  assert.equal(r.guard, false);
});

test('Alt+Tab on an Apple keyboard already works and gets no rule', () => {
  assert.equal(rule('switch-app', 'us', 'apple'), undefined);
  assert.equal(drop('switch-app', 'us', 'apple').reason, 'works');
  assert.equal(rule('switch-app', 'us', 'pc').arrives, 'lopt+tab');
});

test('Win+E on an Apple keyboard types € on DE, so it is dropped as reserved', () => {
  assert.equal(drop('explorer', 'de', 'apple').reason, 'reserved');
  assert.equal(rule('explorer', 'de', 'pc').arrives, 'cmd+e');
});

test('Win+S on a PC keyboard is ⌘S, indistinguishable from a deliberate save', () => {
  assert.equal(drop('search', 'us', 'pc').reason, 'shadow');
});

test('chord helpers', () => {
  assert.equal(normalize('cmd+shift+4'), 'shift+cmd+4');
  assert.equal(arrive('win+shift+s', 'apple'), 'opt+shift+s');
  assert.equal(formatMac('opt+cmd+space'), '⌥⌘Space');
  assert.equal(formatMac('rcmd+q', { sided: true }), 'right ⌘Q');
  assert.equal(formatWin('ctrl+shift+t'), 'Ctrl+Shift+T');
  assert.ok(matches('cmd+q', 'rcmd+q'));
  assert.ok(!matches('rcmd+q', 'lcmd+q'));
});

test('the measured tables reproduce the hand-verified German typing habits', () => {
  const { layouts, mac, win } = loadLayouts();
  const synth = typingHabits(layouts.find((l) => l.id === 'de'), mac, win).habits;
  const authored = lib.habits.filter((h) => h.category === 'typing' && h.layouts.includes('de'));
  assert.equal(synth.length, authored.length);
  for (const a of authored) {
    const s = synth.find((x) => x.id === a.id);
    assert.ok(s, `${a.id} synthesized`);
    assert.equal(normalize(s.windows, 'win'), a.windows, a.id);
    assert.deepEqual(s.mac, a.mac, a.id);
  }
});

test('Czech and Hungarian AltGr+Q/W land on right ⌘Q/⌘W and are guarded', () => {
  for (const l of ['cz', 'hu']) {
    assert.equal(rule(`backslash-${l}`, l, 'apple').arrives, 'rcmd+q');
    assert.equal(rule(`backslash-${l}`, l, 'apple').guard, true);
    assert.equal(rule(`pipe-${l}`, l, 'apple').arrives, 'rcmd+w');
    assert.equal(rule(`pipe-${l}`, l, 'apple').guard, true);
  }
});

test('Swiss German is its own layout: no German right-⌘Q guard there', () => {
  assert.equal(rule('at-sign', 'ch-de', 'apple'), undefined);
  assert.equal(rule('at-sign-ch-de', 'ch-de', 'apple').arrives, 'rcmd+2');
  assert.ok(!lib.habitRules.some((r) => r.layout === 'ch-de' && r.guard));
});

test('Polish: AltGr+N teaches ⌥N (same key), and on a PC keyboard it already works', () => {
  assert.deepEqual(rule('n-acute-pl', 'pl', 'apple').mac, ['opt+n']);
  assert.equal(drop('n-acute-pl', 'pl', 'pc').reason, 'works');
});

test('AZERTY keycaps: the number row is labelled by its digit, letters move', () => {
  assert.equal(lib.keycaps.fr.Digit1, '1');
  assert.equal(lib.keycaps.fr.KeyQ, 'a');
  assert.equal(lib.keycaps.de.KeyY, 'z');
  assert.equal(lib.keycaps.us.KeyY, 'y');
});

test('every layout but "other" maps to at least one Mac input source', () => {
  for (const l of lib.layoutInfo) assert.equal(l.mac.length > 0, l.id !== 'other', l.id);
});
