import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../tools/generate.mjs';
import { check } from '../tools/check.mjs';
import { arrive, formatMac, formatWin, matches, normalize } from '../lib/chord.mjs';

const lib = build();
const rule = (habit, layout, keyboard) => lib.habitRules.find((r) => r.habit === habit && r.layout === layout && r.keyboard === keyboard);
const drop = (habit, layout, keyboard) => lib.dropped.find((r) => r.habit === habit && r.layout === layout && r.keyboard === keyboard);

test('checker is green', () => assert.deepEqual(check(lib), []));
test('at least 50 habits', () => assert.ok(lib.habits.length >= 50));

test('AltGr+Q on an Apple keyboard with DE/AT arrives as right ⌘Q and is guarded', () => {
  for (const l of ['de', 'at']) {
    const r = rule('at-sign', l, 'apple');
    assert.equal(r.arrives, 'rcmd+q');
    assert.equal(r.guard, true);
    assert.deepEqual(r.mac, ['opt+l']);
  }
  assert.equal(rule('at-sign', 'us', 'apple'), undefined, 'US has no AltGr habit');
});

test('PC keyboard: AltGr+Q arrives as right ⌥Q, hinted but never guarded', () => {
  const r = rule('at-sign', 'at', 'pc');
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
