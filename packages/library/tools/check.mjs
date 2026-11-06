#!/usr/bin/env node
// Enforces the library rules from docs/setup/08. Exit 1 on any error.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './generate.mjs';
import { loose } from '../lib/chord.mjs';

export function check(lib) {
  const errors = [];
  const families = new Set(lib.appFamilies.map((f) => f.id));
  const bundles = new Map();
  for (const f of lib.appFamilies) for (const b of f.mac) {
    if (bundles.has(b)) errors.push(`bundle ${b} in two families (${bundles.get(b)}, ${f.id})`);
    bundles.set(b, f.id);
  }
  const ids = new Set();
  for (const h of lib.habits) {
    if (ids.has(h.id)) errors.push(`duplicate habit id ${h.id}`);
    ids.add(h.id);
    if (!families.has(h.family)) errors.push(`${h.id}: unknown family ${h.family}`);
    if (!h.sourceURL || !h.verifiedOn) errors.push(`${h.id}: needs sourceURL + verifiedOn`);
    if (!h.mac.length) errors.push(`${h.id}: no Mac way`);
  }
  const arrivals = new Map();
  for (const r of lib.habitRules) {
    const k = `${r.family}|${r.layout}|${r.keyboard}|${r.arrives}`;
    if (arrivals.has(k)) errors.push(`rules ${arrivals.get(k)} and ${r.id} both fire on ${r.arrives} (${r.family}, ${r.layout}, ${r.keyboard})`);
    arrivals.set(k, r.id);
    if (r.guard && !lib.destructive.map(loose).includes(loose(r.arrives))) errors.push(`${r.id}: guard on a non-destructive chord`);
  }
  // Each layout-dependent habit must cover all its layouts (us/de/at unless restricted).
  for (const h of lib.habits) for (const l of h.layouts) if (!lib.layouts.includes(l)) errors.push(`${h.id}: unknown layout ${l}`);
  const mustGuard = lib.habitRules.filter((r) => r.habit === 'at-sign' && r.keyboard === 'apple');
  if (mustGuard.length !== 2 || !mustGuard.every((r) => r.guard && r.arrives === 'rcmd+q')) errors.push('the right-⌘Q guard for DE/AT Apple keyboards is missing');
  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const lib = build();
  const onDisk = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'library.json'), 'utf8'));
  const errors = check(lib);
  if (JSON.stringify(onDisk) !== JSON.stringify(lib)) errors.push('dist/library.json is stale: run npm run library');
  if (errors.length) { console.error(errors.map((e) => `✗ ${e}`).join('\n')); process.exit(1); }
  console.log(`library ok: ${lib.habits.length} habits, ${lib.habitRules.length} rules`);
}
