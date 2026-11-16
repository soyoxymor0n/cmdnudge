import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../tools/generate.mjs';
import { shareErrors } from '../tools/check.mjs';

// The shared package (#42), read from disk the way another app would read it.
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'share');
const manifestText = readFileSync(join(dir, 'manifest.json'), 'utf8');
const actionsText = readFileSync(join(dir, 'actions.json'), 'utf8');
const lib = build();
const withManifest = (patch, text = actionsText) => {
  const m = { ...JSON.parse(manifestText), ...patch };
  return JSON.stringify(m, null, 2) + '\n';
};
const hash = (text) => createHash('sha256').update(text).digest('hex');

test('the shared package is valid and current', () => {
  assert.deepEqual(shareErrors(lib, manifestText, actionsText), []);
});

test('a reader checks the sha256, then maps copy to Command C', () => {
  assert.equal(hash(actionsText), JSON.parse(manifestText).sha256);
  const copy = JSON.parse(actionsText).actions.find((a) => a.id === 'edit.copy');
  assert.deepEqual(copy.mac, ['cmd+c']);
});

test('the package is MIT and says so in its manifest', () => {
  assert.equal(JSON.parse(manifestText).license, 'MIT');
  assert.ok(shareErrors(lib, withManifest({ license: 'Proprietary' }), actionsText).some((e) => e.includes('MIT')));
});

test('edited data without a new hash fails (negative)', () => {
  const tampered = actionsText.replace('"cmd+c"', '"cmd+x"');
  assert.ok(shareErrors(lib, manifestText, tampered).some((e) => e.includes('sha256')));
});

test('a version that is not MAJOR.MINOR.PATCH fails', () => {
  assert.ok(shareErrors(lib, withManifest({ version: '1.0' }), actionsText).some((e) => e.includes('version')));
});

test('a chord that does not parse fails, even with a matching hash', () => {
  const data = JSON.parse(actionsText);
  data.actions[0].mac = ['cmd+'];
  const text = JSON.stringify(data, null, 2) + '\n';
  const errors = shareErrors(lib, withManifest({ sha256: hash(text), actionCount: data.actions.length }, text), text);
  assert.ok(errors.some((e) => e.startsWith('edit.copy:')), errors.join('; '));
});
